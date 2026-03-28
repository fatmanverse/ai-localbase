package util

import (
	"bytes"
	"fmt"
	"os/exec"
	"strings"
)

func OCRImage(path string) (string, error) {
	tesseractPath, err := exec.LookPath("tesseract")
	if err != nil {
		return "", fmt.Errorf("tesseract not found")
	}

	candidates := [][]string{
		{"-l", "chi_sim+eng", "--psm", "6"},
		{"-l", "eng", "--psm", "6"},
	}

	for _, args := range candidates {
		var stdout, stderr bytes.Buffer
		cmdArgs := append([]string{path, "stdout"}, args...)
		cmd := exec.Command(tesseractPath, cmdArgs...)
		cmd.Stdout = &stdout
		cmd.Stderr = &stderr
		if err := cmd.Run(); err != nil {
			continue
		}
		text := normalizeExtractedText(stdout.String())
		if strings.TrimSpace(text) != "" {
			return text, nil
		}
	}

	return "", nil
}
