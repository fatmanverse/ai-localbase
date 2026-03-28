package util

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"hash/fnv"
	stdhtml "html"
	"io"
	"io/fs"
	"net/url"
	"os"
	"os/exec"
	pathpkg "path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"ai-localbase/internal/model"

	xhtml "golang.org/x/net/html"
)

const (
	maxImageAssetsPerDocument = 24
	imageContextPreviewLimit  = 140
)

var (
	markdownImageRegexp = regexp.MustCompile(`!\[([^\]]*)\]\(([^)]+)\)`)
	imageIDRegexp       = regexp.MustCompile(`图片ID[:：]\s*(img-[a-zA-Z0-9_-]+)`)
)

var supportedUploadExtensions = map[string]struct{}{
	".txt":  {},
	".md":   {},
	".pdf":  {},
	".docx": {},
	".html": {},
	".htm":  {},
	".png":  {},
	".jpg":  {},
	".jpeg": {},
	".webp": {},
	".gif":  {},
}

var supportedImageExtensions = map[string]struct{}{
	".png":  {},
	".jpg":  {},
	".jpeg": {},
	".webp": {},
	".gif":  {},
	".bmp":  {},
}

type contentSegment struct {
	kind string
	text string
	ref  string
	alt  string
}

func IsSupportedUploadExtension(ext string) bool {
	_, ok := supportedUploadExtensions[strings.ToLower(strings.TrimSpace(ext))]
	return ok
}

func IsImageFileExtension(ext string) bool {
	_, ok := supportedImageExtensions[strings.ToLower(strings.TrimSpace(ext))]
	return ok
}

func IsImageFilePath(path string) bool {
	return IsImageFileExtension(filepath.Ext(path))
}

func DocumentAssetDir(documentPath string) string {
	base := strings.TrimSuffix(filepath.Base(documentPath), filepath.Ext(documentPath))
	base = SanitizeFilename(base)
	if base == "" {
		base = "document"
	}
	return filepath.Join(filepath.Dir(documentPath), base+"_assets")
}

func RemoveDocumentArtifacts(documentPath string) error {
	assetDir := DocumentAssetDir(documentPath)
	if err := os.RemoveAll(assetDir); err != nil {
		return err
	}
	return nil
}

func BuildPublicAssetURL(uploadDir, assetPath string) string {
	if strings.TrimSpace(uploadDir) == "" || strings.TrimSpace(assetPath) == "" {
		return ""
	}
	rootAbs, err := filepath.Abs(uploadDir)
	if err != nil {
		return ""
	}
	assetAbs, err := filepath.Abs(assetPath)
	if err != nil {
		return ""
	}
	rel, err := filepath.Rel(rootAbs, assetAbs)
	if err != nil {
		return ""
	}
	rel = filepath.ToSlash(rel)
	if rel == "." || strings.HasPrefix(rel, "../") {
		return ""
	}
	return "/api/assets/" + pathpkg.Clean(rel)
}

func ExtractDocumentContent(path string) (model.DocumentContent, error) {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".txt":
		text, err := extractPlainTextFile(path)
		if err != nil {
			return model.DocumentContent{}, err
		}
		return model.DocumentContent{Text: text}, nil
	case ".md":
		return extractMarkdownContent(path)
	case ".pdf":
		return extractPDFContent(path)
	case ".docx":
		return extractDOCXContent(path)
	case ".html", ".htm":
		return extractHTMLContent(path)
	default:
		if IsImageFileExtension(ext) {
			return extractDirectImageContent(path)
		}
		return model.DocumentContent{}, fmt.Errorf("unsupported file type: %s", ext)
	}
}

func BuildDocumentRetrievalText(content model.DocumentContent) string {
	parts := make([]string, 0, 1+len(content.Images))
	if text := strings.TrimSpace(content.Text); text != "" {
		parts = append(parts, text)
	}

	imageSections := make([]string, 0, len(content.Images))
	for _, image := range content.Images {
		if !image.Included {
			continue
		}
		if section := strings.TrimSpace(image.RetrievalText); section != "" {
			imageSections = append(imageSections, section)
		}
	}
	if len(imageSections) > 0 {
		parts = append(parts, "## 图片知识补充\n"+strings.Join(imageSections, "\n\n"))
	}

	joined := strings.TrimSpace(strings.Join(parts, "\n\n"))
	if joined == "" {
		return ""
	}
	return normalizeExtractedText(joined)
}

func ExtractImageIDsFromText(text string) []string {
	matches := imageIDRegexp.FindAllStringSubmatch(text, -1)
	if len(matches) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(matches))
	items := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		id := strings.TrimSpace(match[1])
		if id == "" {
			continue
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		items = append(items, id)
	}
	return items
}

func BuildDocumentImageSummaries(content model.DocumentContent, uploadDir string) []model.DocumentImageAsset {
	items := make([]model.DocumentImageAsset, 0, len(content.Images))
	for _, image := range content.Images {
		item := model.DocumentImageAsset{
			ID:             image.ID,
			SourceRef:      image.SourceRef,
			FileName:       image.FileName,
			PublicURL:      BuildPublicAssetURL(uploadDir, image.SourcePath),
			AltText:        image.AltText,
			Classification: image.Classification,
			Included:       image.Included,
			Description:    image.Description,
			ContextBefore:  image.ContextBefore,
			ContextAfter:   image.ContextAfter,
		}
		items = append(items, item)
	}
	return items
}

func extractMarkdownContent(path string) (model.DocumentContent, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return model.DocumentContent{}, err
	}
	text := normalizeExtractedText(string(raw))
	segments := buildMarkdownSegments(string(raw))
	images := buildImageAssetsFromSegments(path, segments, resolveDocumentImageReference)
	if strings.Contains(string(raw), "<img") {
		_, htmlSegments, err := parseHTMLSegments(string(raw))
		if err == nil {
			images = append(images, buildImageAssetsFromSegments(path, htmlSegments, resolveDocumentImageReference)...)
		}
	}
	return finalizeDocumentContent(path, text, images), nil
}

func extractHTMLContent(path string) (model.DocumentContent, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return model.DocumentContent{}, err
	}
	text, segments, err := parseHTMLSegments(string(raw))
	if err != nil {
		return model.DocumentContent{}, err
	}
	images := buildImageAssetsFromSegments(path, segments, resolveDocumentImageReference)
	return finalizeDocumentContent(path, text, images), nil
}

func extractDirectImageContent(path string) (model.DocumentContent, error) {
	asset := model.DocumentImageAsset{
		SourcePath: path,
		SourceRef:  filepath.Base(path),
		FileName:   filepath.Base(path),
		Included:   true,
	}
	content := finalizeDocumentContent(path, "", []model.DocumentImageAsset{asset})
	if len(content.Images) == 0 {
		return content, nil
	}
	content.Images[0].Included = true
	content.Images[0].RetrievalText = buildImageRetrievalText(content.Images[0])
	if strings.TrimSpace(content.Text) == "" {
		content.Text = firstNonEmpty(strings.TrimSpace(content.Images[0].OCRText), strings.TrimSpace(content.Images[0].Description))
	}
	return content, nil
}

func extractDOCXContent(path string) (model.DocumentContent, error) {
	text, textErr := extractDOCXText(path)
	images, imageErr := extractDOCXImages(path)
	if textErr != nil && imageErr != nil {
		return model.DocumentContent{}, textErr
	}
	return finalizeDocumentContent(path, text, images), nil
}

func extractPDFContent(path string) (model.DocumentContent, error) {
	text, textErr := extractPDFText(path)
	images, _ := extractPDFImages(path, text)
	if textErr != nil && len(images) == 0 {
		return model.DocumentContent{}, textErr
	}
	return finalizeDocumentContent(path, text, images), nil
}

func finalizeDocumentContent(documentPath, text string, images []model.DocumentImageAsset) model.DocumentContent {
	text = normalizeExtractedText(text)
	items := dedupeImageAssets(images)
	if len(items) > maxImageAssetsPerDocument {
		items = items[:maxImageAssetsPerDocument]
	}
	for index := range items {
		items[index] = enrichImageAsset(documentPath, items[index], index)
	}
	if strings.TrimSpace(text) == "" && len(items) > 0 {
		fallback := make([]string, 0, len(items))
		for _, item := range items {
			if !item.Included {
				continue
			}
			if description := strings.TrimSpace(item.Description); description != "" {
				fallback = append(fallback, description)
			}
		}
		text = strings.Join(fallback, "\n")
	}
	return model.DocumentContent{Text: text, Images: items}
}

func dedupeImageAssets(images []model.DocumentImageAsset) []model.DocumentImageAsset {
	items := make([]model.DocumentImageAsset, 0, len(images))
	seen := make(map[string]struct{}, len(images))
	for _, image := range images {
		key := strings.Join([]string{
			strings.TrimSpace(image.SourcePath),
			strings.TrimSpace(image.SourceRef),
			strings.TrimSpace(image.AltText),
			strings.TrimSpace(image.ContextBefore),
			strings.TrimSpace(image.ContextAfter),
		}, "|")
		if key == "||||" {
			continue
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		items = append(items, image)
	}
	return items
}

func buildMarkdownSegments(raw string) []contentSegment {
	segments := make([]contentSegment, 0)
	matches := markdownImageRegexp.FindAllStringSubmatchIndex(raw, -1)
	if len(matches) == 0 {
		return []contentSegment{{kind: "text", text: raw}}
	}
	cursor := 0
	for _, match := range matches {
		if len(match) < 6 {
			continue
		}
		start, end := match[0], match[1]
		if start > cursor {
			segments = append(segments, contentSegment{kind: "text", text: raw[cursor:start]})
		}
		alt := raw[match[2]:match[3]]
		ref := raw[match[4]:match[5]]
		segments = append(segments, contentSegment{kind: "image", ref: parseMarkdownImageTarget(ref), alt: strings.TrimSpace(alt)})
		cursor = end
	}
	if cursor < len(raw) {
		segments = append(segments, contentSegment{kind: "text", text: raw[cursor:]})
	}
	return segments
}

func parseMarkdownImageTarget(value string) string {
	trimmed := strings.TrimSpace(value)
	trimmed = strings.Trim(trimmed, "<>")
	if trimmed == "" {
		return ""
	}
	fields := strings.Fields(trimmed)
	if len(fields) == 0 {
		return trimmed
	}
	candidate := strings.Trim(fields[0], `"'`)
	return candidate
}

func parseHTMLSegments(raw string) (string, []contentSegment, error) {
	tokenizer := xhtml.NewTokenizer(strings.NewReader(raw))
	segments := make([]contentSegment, 0)
	skipDepth := 0
	skipTag := ""

	for {
		tokenType := tokenizer.Next()
		if tokenType == xhtml.ErrorToken {
			if err := tokenizer.Err(); err != nil && err != io.EOF {
				return "", nil, err
			}
			break
		}
		token := tokenizer.Token()
		switch tokenType {
		case xhtml.StartTagToken, xhtml.SelfClosingTagToken:
			tagName := strings.ToLower(token.Data)
			if tagName == "script" || tagName == "style" || tagName == "noscript" {
				if tokenType != xhtml.SelfClosingTagToken {
					skipDepth++
					skipTag = tagName
				}
				continue
			}
			if skipDepth > 0 {
				continue
			}
			if tagName == "img" {
				var src, alt, title string
				for _, attr := range token.Attr {
					switch strings.ToLower(attr.Key) {
					case "src":
						src = strings.TrimSpace(attr.Val)
					case "alt":
						alt = strings.TrimSpace(attr.Val)
					case "title":
						title = strings.TrimSpace(attr.Val)
					}
				}
				segments = append(segments, contentSegment{kind: "image", ref: src, alt: firstNonEmpty(alt, title)})
			}
			if tagName == "br" || tagName == "hr" || tagName == "p" || tagName == "div" || tagName == "li" {
				segments = append(segments, contentSegment{kind: "text", text: "\n"})
			}
		case xhtml.EndTagToken:
			tagName := strings.ToLower(token.Data)
			if skipDepth > 0 && tagName == skipTag {
				skipDepth--
				if skipDepth == 0 {
					skipTag = ""
				}
				continue
			}
			if skipDepth > 0 {
				continue
			}
			if tagName == "p" || tagName == "div" || tagName == "li" {
				segments = append(segments, contentSegment{kind: "text", text: "\n"})
			}
		case xhtml.TextToken:
			if skipDepth > 0 {
				continue
			}
			text := strings.TrimSpace(stdhtml.UnescapeString(string(tokenizer.Text())))
			if text != "" {
				segments = append(segments, contentSegment{kind: "text", text: text})
			}
		}
	}

	textSegments := make([]string, 0, len(segments))
	for _, segment := range segments {
		if segment.kind == "text" {
			textSegments = append(textSegments, segment.text)
		}
	}
	return normalizeExtractedText(strings.Join(textSegments, "\n")), segments, nil
}

func buildImageAssetsFromSegments(documentPath string, segments []contentSegment, resolver func(string, string) (string, string)) []model.DocumentImageAsset {
	items := make([]model.DocumentImageAsset, 0)
	for index, segment := range segments {
		if segment.kind != "image" {
			continue
		}
		sourcePath, sourceRef := resolver(documentPath, segment.ref)
		asset := model.DocumentImageAsset{
			SourcePath:    sourcePath,
			SourceRef:     firstNonEmpty(sourceRef, segment.ref),
			FileName:      filepath.Base(firstNonEmpty(sourcePath, sourceRef, segment.ref)),
			AltText:       strings.TrimSpace(segment.alt),
			ContextBefore: surroundingSegmentText(segments, index, -1),
			ContextAfter:  surroundingSegmentText(segments, index, 1),
		}
		items = append(items, asset)
	}
	return items
}

func surroundingSegmentText(segments []contentSegment, start, direction int) string {
	parts := make([]string, 0)
	for i := start + direction; i >= 0 && i < len(segments); i += direction {
		segment := segments[i]
		if segment.kind != "text" {
			continue
		}
		text := normalizePreviewText(segment.text)
		if text == "" {
			continue
		}
		if direction < 0 {
			parts = append([]string{text}, parts...)
		} else {
			parts = append(parts, text)
		}
		joined := strings.Join(parts, " ")
		if len([]rune(joined)) >= imageContextPreviewLimit {
			return shortenText(joined, imageContextPreviewLimit)
		}
	}
	return shortenText(strings.Join(parts, " "), imageContextPreviewLimit)
}

func resolveDocumentImageReference(documentPath, ref string) (string, string) {
	trimmed := strings.TrimSpace(ref)
	if trimmed == "" {
		return "", ""
	}
	trimmed = strings.Trim(trimmed, "<>")
	if strings.HasPrefix(trimmed, "data:") {
		return "", trimmed
	}
	if parsed, err := url.Parse(trimmed); err == nil && parsed.Scheme != "" {
		return "", trimmed
	}
	candidate := trimmed
	if index := strings.IndexAny(candidate, "?#"); index >= 0 {
		candidate = candidate[:index]
	}
	candidate = filepath.FromSlash(candidate)
	if !filepath.IsAbs(candidate) {
		candidate = filepath.Join(filepath.Dir(documentPath), candidate)
	}
	info, err := os.Stat(candidate)
	if err != nil || info.IsDir() || !IsImageFileExtension(filepath.Ext(candidate)) {
		return "", trimmed
	}
	copied, err := copyLocalImageToAssetDir(documentPath, candidate)
	if err != nil {
		return candidate, trimmed
	}
	return copied, trimmed
}

func copyLocalImageToAssetDir(documentPath, sourcePath string) (string, error) {
	assetDir, err := ensureDocumentAssetDir(documentPath)
	if err != nil {
		return "", err
	}
	targetName := SanitizeFilename(filepath.Base(sourcePath))
	if filepath.Clean(sourcePath) == filepath.Clean(filepath.Join(assetDir, targetName)) {
		return sourcePath, nil
	}
	targetPath := filepath.Join(assetDir, targetName)
	input, err := os.ReadFile(sourcePath)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(targetPath, input, 0o644); err != nil {
		return "", err
	}
	return targetPath, nil
}

func ensureDocumentAssetDir(documentPath string) (string, error) {
	assetDir := DocumentAssetDir(documentPath)
	if err := os.MkdirAll(assetDir, 0o755); err != nil {
		return "", err
	}
	return assetDir, nil
}

func extractDOCXImages(path string) ([]model.DocumentImageAsset, error) {
	reader, err := zip.OpenReader(path)
	if err != nil {
		return nil, err
	}
	defer reader.Close()

	filesByName := make(map[string]*zip.File, len(reader.File))
	mediaFiles := make([]*zip.File, 0)
	for _, file := range reader.File {
		filesByName[file.Name] = file
		if strings.HasPrefix(file.Name, "word/media/") && IsImageFileExtension(filepath.Ext(file.Name)) {
			mediaFiles = append(mediaFiles, file)
		}
	}
	if len(mediaFiles) == 0 {
		return nil, nil
	}

	assetDir, err := ensureDocumentAssetDir(path)
	if err != nil {
		return nil, err
	}

	storedMedia := make(map[string]string, len(mediaFiles))
	for _, file := range mediaFiles {
		storedPath, err := extractZipFileToPath(file, filepath.Join(assetDir, SanitizeFilename(filepath.Base(file.Name))))
		if err != nil {
			continue
		}
		targetKey := strings.TrimPrefix(file.Name, "word/")
		storedMedia[targetKey] = storedPath
		storedMedia[file.Name] = storedPath
	}

	relationships := map[string]string{}
	if relFile, ok := filesByName["word/_rels/document.xml.rels"]; ok {
		if relData, err := readZipEntry(relFile); err == nil {
			relationships = parseDOCXRelationships(relData)
		}
	}

	segments := make([]contentSegment, 0)
	if documentFile, ok := filesByName["word/document.xml"]; ok {
		documentData, err := readZipEntry(documentFile)
		if err == nil {
			if parsed, parseErr := parseDOCXSegments(documentData, relationships); parseErr == nil {
				segments = parsed
			}
		}
	}

	items := make([]model.DocumentImageAsset, 0)
	if len(segments) > 0 {
		items = buildImageAssetsFromSegments(path, segments, func(_ string, ref string) (string, string) {
			trimmed := strings.TrimPrefix(strings.TrimSpace(ref), "/")
			storedPath := storedMedia[trimmed]
			if storedPath == "" {
				storedPath = storedMedia["word/"+trimmed]
			}
			return storedPath, trimmed
		})
	}
	if len(items) > 0 {
		return items, nil
	}

	keys := make([]string, 0, len(storedMedia))
	for key := range storedMedia {
		if strings.HasPrefix(key, "word/") {
			continue
		}
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		items = append(items, model.DocumentImageAsset{
			SourcePath: storedMedia[key],
			SourceRef:  key,
			FileName:   filepath.Base(key),
		})
	}
	return items, nil
}

func parseDOCXRelationships(data []byte) map[string]string {
	items := map[string]string{}
	decoder := xml.NewDecoder(bytes.NewReader(data))
	for {
		token, err := decoder.Token()
		if err != nil {
			if err == io.EOF {
				break
			}
			return items
		}
		start, ok := token.(xml.StartElement)
		if !ok || start.Name.Local != "Relationship" {
			continue
		}
		var id, target string
		for _, attr := range start.Attr {
			switch attr.Name.Local {
			case "Id":
				id = strings.TrimSpace(attr.Value)
			case "Target":
				target = strings.TrimSpace(attr.Value)
			}
		}
		if id != "" && target != "" {
			items[id] = strings.TrimPrefix(filepath.ToSlash(target), "./")
		}
	}
	return items
}

func parseDOCXSegments(data []byte, relationships map[string]string) ([]contentSegment, error) {
	decoder := xml.NewDecoder(bytes.NewReader(data))
	segments := make([]contentSegment, 0)
	var textBuilder strings.Builder
	inText := false
	pendingAlt := ""
	flushText := func() {
		value := textBuilder.String()
		if strings.TrimSpace(value) != "" {
			segments = append(segments, contentSegment{kind: "text", text: value})
		}
		textBuilder.Reset()
	}

	for {
		token, err := decoder.Token()
		if err != nil {
			if err == io.EOF {
				break
			}
			return nil, err
		}
		switch typed := token.(type) {
		case xml.StartElement:
			switch typed.Name.Local {
			case "t":
				inText = true
			case "tab":
				textBuilder.WriteString("\t")
			case "br", "cr":
				textBuilder.WriteString("\n")
			case "docPr":
				pendingAlt = firstNonEmpty(attrValue(typed.Attr, "descr"), attrValue(typed.Attr, "title"), attrValue(typed.Attr, "name"))
			case "blip":
				ref := attrValue(typed.Attr, "embed")
				if ref == "" {
					ref = attrValue(typed.Attr, "link")
				}
				if ref != "" {
					flushText()
					segments = append(segments, contentSegment{kind: "image", ref: relationships[ref], alt: pendingAlt})
					pendingAlt = ""
				}
			case "imagedata":
				ref := attrValue(typed.Attr, "id")
				if ref != "" {
					flushText()
					segments = append(segments, contentSegment{kind: "image", ref: relationships[ref], alt: pendingAlt})
					pendingAlt = ""
				}
			}
		case xml.EndElement:
			switch typed.Name.Local {
			case "t":
				inText = false
			case "p":
				textBuilder.WriteString("\n\n")
			case "tr":
				textBuilder.WriteString("\n")
			}
		case xml.CharData:
			if inText {
				textBuilder.Write([]byte(typed))
			}
		}
	}
	flushText()
	return segments, nil
}

func attrValue(attrs []xml.Attr, localName string) string {
	for _, attr := range attrs {
		if attr.Name.Local == localName {
			return strings.TrimSpace(attr.Value)
		}
	}
	return ""
}

func extractPDFImages(path string, docText string) ([]model.DocumentImageAsset, error) {
	items, err := extractPDFImagesWithPdfImages(path, docText)
	if err == nil && len(items) > 0 {
		return items, nil
	}
	fallback, fallbackErr := renderPDFPagesAsImages(path, docText)
	if fallbackErr == nil && len(fallback) > 0 {
		return fallback, nil
	}
	if err != nil {
		return nil, err
	}
	return nil, fallbackErr
}

func extractPDFImagesWithPdfImages(path string, docText string) ([]model.DocumentImageAsset, error) {
	binary, err := exec.LookPath("pdfimages")
	if err != nil {
		return nil, fmt.Errorf("pdfimages not found")
	}
	assetDir, err := ensureDocumentAssetDir(path)
	if err != nil {
		return nil, err
	}
	prefix := filepath.Join(assetDir, "pdfimg")
	cmd := exec.Command(binary, "-png", path, prefix)
	if output, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("pdfimages failed: %s", strings.TrimSpace(string(output)))
	}
	files, err := filepath.Glob(prefix + "-*")
	if err != nil {
		return nil, err
	}
	items := make([]model.DocumentImageAsset, 0, len(files))
	for _, file := range files {
		if !IsImageFileExtension(filepath.Ext(file)) {
			continue
		}
		items = append(items, model.DocumentImageAsset{
			SourcePath:    file,
			SourceRef:     filepath.Base(file),
			FileName:      filepath.Base(file),
			ContextBefore: shortenText(normalizePreviewText(docText), imageContextPreviewLimit),
		})
	}
	return items, nil
}

func renderPDFPagesAsImages(path string, docText string) ([]model.DocumentImageAsset, error) {
	binary, err := exec.LookPath("pdftoppm")
	if err != nil {
		return nil, fmt.Errorf("pdftoppm not found")
	}
	assetDir, err := ensureDocumentAssetDir(path)
	if err != nil {
		return nil, err
	}
	prefix := filepath.Join(assetDir, "page")
	cmd := exec.Command(binary, "-png", "-f", "1", "-l", "3", path, prefix)
	if output, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("pdftoppm failed: %s", strings.TrimSpace(string(output)))
	}
	files, err := filepath.Glob(prefix + "-*.png")
	if err != nil {
		return nil, err
	}
	sort.Strings(files)
	items := make([]model.DocumentImageAsset, 0, len(files))
	for _, file := range files {
		items = append(items, model.DocumentImageAsset{
			SourcePath:    file,
			SourceRef:     filepath.Base(file),
			FileName:      filepath.Base(file),
			ContextBefore: shortenText(normalizePreviewText(docText), imageContextPreviewLimit),
		})
	}
	return items, nil
}

func enrichImageAsset(documentPath string, asset model.DocumentImageAsset, ordinal int) model.DocumentImageAsset {
	asset.SourcePath = strings.TrimSpace(asset.SourcePath)
	asset.SourceRef = strings.TrimSpace(asset.SourceRef)
	asset.FileName = firstNonEmpty(strings.TrimSpace(asset.FileName), filepath.Base(firstNonEmpty(asset.SourcePath, asset.SourceRef)))
	asset.AltText = strings.TrimSpace(asset.AltText)
	asset.ContextBefore = shortenText(normalizePreviewText(asset.ContextBefore), imageContextPreviewLimit)
	asset.ContextAfter = shortenText(normalizePreviewText(asset.ContextAfter), imageContextPreviewLimit)

	if strings.TrimSpace(asset.ID) == "" {
		asset.ID = buildDocumentImageID(documentPath, asset, ordinal)
	}
	if strings.TrimSpace(asset.OCRText) == "" && asset.SourcePath != "" && IsImageFilePath(asset.SourcePath) {
		if ocrText, err := OCRImage(asset.SourcePath); err == nil {
			asset.OCRText = strings.TrimSpace(ocrText)
		}
	}
	asset.Classification = classifyImageAsset(asset)
	asset.Included = shouldIndexImageAsset(asset)
	asset.Description = buildImageDescription(asset)
	if asset.Included {
		asset.RetrievalText = buildImageRetrievalText(asset)
	}
	return asset
}

func buildDocumentImageID(documentPath string, asset model.DocumentImageAsset, ordinal int) string {
	hash := fnv.New64a()
	_, _ = hash.Write([]byte(documentPath))
	_, _ = hash.Write([]byte("|"))
	_, _ = hash.Write([]byte(asset.SourcePath))
	_, _ = hash.Write([]byte("|"))
	_, _ = hash.Write([]byte(asset.SourceRef))
	_, _ = hash.Write([]byte("|"))
	_, _ = hash.Write([]byte(asset.AltText))
	_, _ = hash.Write([]byte("|"))
	_, _ = hash.Write([]byte(fmt.Sprintf("%d", ordinal)))
	return fmt.Sprintf("img-%x", hash.Sum64())
}

func classifyImageAsset(asset model.DocumentImageAsset) model.DocumentImageClassification {
	signal := strings.ToLower(strings.Join([]string{
		asset.FileName,
		asset.SourceRef,
		asset.AltText,
		asset.OCRText,
		asset.ContextBefore,
		asset.ContextAfter,
	}, " "))
	ocrText := normalizePreviewText(asset.OCRText)
	switch {
	case strings.Contains(signal, "logo") || strings.Contains(signal, "icon") || strings.Contains(signal, "banner") || strings.Contains(signal, "watermark") || strings.Contains(signal, "装饰"):
		if len([]rune(ocrText)) <= 10 {
			return model.DocumentImageDecorative
		}
	case containsAny(signal, "流程", "架构", "拓扑", "diagram", "workflow", "network", "topology"):
		return model.DocumentImageFlowDiagram
	case looksLikeTable(ocrText, signal):
		return model.DocumentImageTableScreenshot
	case containsAny(signal, "截图", "页面", "按钮", "菜单", "点击", "设置", "submit", "login", "save"):
		return model.DocumentImageKeyOperation
	case len([]rune(ocrText)) > 0:
		return model.DocumentImageTextScreenshot
	default:
		return model.DocumentImageMeaningfulOther
	}
	return model.DocumentImageMeaningfulOther
}

func shouldIndexImageAsset(asset model.DocumentImageAsset) bool {
	if asset.Classification == model.DocumentImageDecorative {
		usefulSignal := strings.TrimSpace(asset.AltText) != "" || strings.TrimSpace(asset.OCRText) != "" || strings.TrimSpace(asset.ContextBefore) != "" || strings.TrimSpace(asset.ContextAfter) != ""
		return usefulSignal
	}
	return true
}

func buildImageDescription(asset model.DocumentImageAsset) string {
	parts := []string{fmt.Sprintf("图片类型：%s", imageClassificationLabel(asset.Classification))}
	if alt := shortenText(asset.AltText, 80); alt != "" {
		parts = append(parts, "原始说明："+alt)
	}
	if ocr := shortenText(normalizePreviewText(asset.OCRText), 160); ocr != "" {
		parts = append(parts, "识别文字："+ocr)
	}
	if ctx := shortenText(strings.TrimSpace(strings.Join(filterEmptyStrings(asset.ContextBefore, asset.ContextAfter), " | ")), 180); ctx != "" {
		parts = append(parts, "图文上下文："+ctx)
	}
	if !asset.Included {
		parts = append(parts, "判定：疑似装饰图，可降级忽略")
	} else {
		parts = append(parts, "用途：可用于补充回答与截图、流程、表格或界面操作相关的问题")
	}
	return strings.Join(parts, "；")
}

func buildImageRetrievalText(asset model.DocumentImageAsset) string {
	lines := []string{
		fmt.Sprintf("图片ID: %s", asset.ID),
		fmt.Sprintf("图片类型: %s", imageClassificationLabel(asset.Classification)),
	}
	if ref := firstNonEmpty(asset.AltText, asset.SourceRef, asset.FileName); ref != "" {
		lines = append(lines, "图片标题: "+shortenText(ref, 120))
	}
	if description := strings.TrimSpace(asset.Description); description != "" {
		lines = append(lines, "图片说明: "+shortenText(description, 220))
	}
	if ocr := shortenText(normalizePreviewText(asset.OCRText), 220); ocr != "" {
		lines = append(lines, "图片OCR: "+ocr)
	}
	if asset.ContextBefore != "" {
		lines = append(lines, "前文: "+shortenText(asset.ContextBefore, 120))
	}
	if asset.ContextAfter != "" {
		lines = append(lines, "后文: "+shortenText(asset.ContextAfter, 120))
	}
	return strings.Join(lines, "\n")
}

func imageClassificationLabel(classification model.DocumentImageClassification) string {
	switch classification {
	case model.DocumentImageDecorative:
		return "装饰图"
	case model.DocumentImageTextScreenshot:
		return "含文字截图"
	case model.DocumentImageFlowDiagram:
		return "流程图/架构图"
	case model.DocumentImageTableScreenshot:
		return "表格截图"
	case model.DocumentImageKeyOperation:
		return "关键操作截图"
	case model.DocumentImageMeaningfulOther:
		fallthrough
	default:
		return "其他业务图片"
	}
}

func containsAny(value string, items ...string) bool {
	for _, item := range items {
		if strings.Contains(value, strings.ToLower(item)) {
			return true
		}
	}
	return false
}

func looksLikeTable(ocrText, signal string) bool {
	if containsAny(signal, "表格", "table") {
		return true
	}
	lines := strings.Split(ocrText, "\n")
	aligned := 0
	for _, line := range lines {
		if strings.Count(line, " ") >= 3 || strings.Count(line, "|") >= 2 || strings.Count(line, "\t") >= 2 {
			aligned++
		}
	}
	return aligned >= 2
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func shortenText(value string, limit int) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || limit <= 0 {
		return trimmed
	}
	runes := []rune(trimmed)
	if len(runes) <= limit {
		return trimmed
	}
	return string(runes[:limit]) + "..."
}

func filterEmptyStrings(values ...string) []string {
	items := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			items = append(items, trimmed)
		}
	}
	return items
}

func extractZipFileToPath(file *zip.File, targetPath string) (string, error) {
	reader, err := file.Open()
	if err != nil {
		return "", err
	}
	defer reader.Close()
	data, err := io.ReadAll(reader)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(targetPath, data, 0o644); err != nil {
		return "", err
	}
	return targetPath, nil
}

func readZipEntry(file *zip.File) ([]byte, error) {
	reader, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	return io.ReadAll(reader)
}

func WalkDocumentAssetFiles(documentPath string) ([]string, error) {
	assetDir := DocumentAssetDir(documentPath)
	files := make([]string, 0)
	err := filepath.WalkDir(assetDir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		files = append(files, path)
		return nil
	})
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	return files, nil
}
