package util

import (
	"regexp"
	"strings"
)

var assistantResponseLinePatterns = []struct {
	re   *regexp.Regexp
	repl string
}{
	{regexp.MustCompile(`(?m)^[ \t]*(根据(?:当前|现有|以上)?(?:资料|文档|信息|内容|上下文)[：:，, ]*)`), ""},
	{regexp.MustCompile(`(?m)^[ \t]*(基于(?:当前|现有|以上)?(?:资料|文档|信息|内容|上下文)[：:，, ]*)`), ""},
	{regexp.MustCompile(`(?m)^[ \t]*(结合(?:当前|现有|以上)?(?:资料|文档|信息|内容|上下文)[：:，, ]*)`), ""},
	{regexp.MustCompile(`(?m)^[ \t]*(从资料来看[：:，, ]*)`), ""},
	{regexp.MustCompile(`(?m)^[ \t]*(?:下面|以下)(?:是|给出)?(?:分析|判断|说明|处理建议|处理步骤|排查步骤)[：:，, ]*$`), ""},
	{regexp.MustCompile(`(?m)^[ \t]*(总的来说[：:，, ]*)`), ""},
	{regexp.MustCompile(`(?m)^[ \t]*(总体来看[：:，, ]*)`), ""},
	{regexp.MustCompile(`(?m)^[ \t]*(综合来看[：:，, ]*)`), ""},
	{regexp.MustCompile(`(?m)^[ \t]*(简单来说[：:，, ]*)`), ""},
	{regexp.MustCompile(`(?m)^[ \t]*(作为 ?AI(?:助手|模型)?[：:，, ]*)`), ""},
	{regexp.MustCompile(`(?m)^[ \t]*希望以上(?:内容)?对你有帮助[。！! ]*$`), ""},
	{regexp.MustCompile(`(?m)^[ \t]*如果还有其他问题，?欢迎随时提问[。！! ]*$`), ""},
	{regexp.MustCompile(`(?m)^[ \t]*如需进一步(?:协助|帮助)，?请继续反馈[。！! ]*$`), ""},
	{regexp.MustCompile(`(?m)^[ \t]*如果现场还有异常，?把现象和报错补过来，我继续往下看[。！! ]*$`), "如果现场还有异常，把现象和报错补过来，我继续往下看。"},
}

var assistantResponseInlineReplacer = strings.NewReplacer(
	"您可以尝试", "先这样处理",
	"你可以尝试", "先这样处理",
	"可能由多种原因导致", "常见原因一般有这几类",
	"建议用户", "建议先",
)

func PolishAssistantResponse(content string) string {
	trimmed := strings.TrimSpace(strings.ReplaceAll(content, "\r\n", "\n"))
	if trimmed == "" {
		return ""
	}

	parts := strings.Split(trimmed, "```")
	for index := 0; index < len(parts); index += 2 {
		parts[index] = polishAssistantPlainText(parts[index])
	}

	result := strings.TrimSpace(strings.Join(parts, "```"))
	if result == "" {
		return trimmed
	}
	return result
}

func polishAssistantPlainText(content string) string {
	text := strings.TrimSpace(strings.TrimLeft(content, "\ufeff"))
	if text == "" {
		return text
	}

	text = assistantResponseInlineReplacer.Replace(text)
	for _, rule := range assistantResponseLinePatterns {
		text = rule.re.ReplaceAllString(text, rule.repl)
	}

	lines := strings.Split(text, "\n")
	for index, line := range lines {
		lines[index] = strings.TrimRight(line, " \t")
	}
	text = strings.Join(lines, "\n")

	for strings.Contains(text, "\n\n\n") {
		text = strings.ReplaceAll(text, "\n\n\n", "\n\n")
	}

	return strings.TrimSpace(text)
}
