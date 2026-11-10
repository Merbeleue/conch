package main

import (
	"fmt"
	"strings"
	"sync/atomic"
)

// uiLanguage holds the language the frontend is rendering. It starts as
// English so every backend message is meaningful before the first window
// reports its stored preference.
var uiLanguage atomic.Value

func init() {
	uiLanguage.Store("en")
}

func setUILanguage(lang string) {
	if strings.EqualFold(strings.TrimSpace(lang), "zh-CN") {
		uiLanguage.Store("zh-CN")
		return
	}
	uiLanguage.Store("en")
}

func uiIsChinese() bool {
	code, _ := uiLanguage.Load().(string)
	return code == "zh-CN"
}

// tr picks between the English and Chinese wording of one backend message.
// Keeping both halves side by side makes a missing translation obvious.
func tr(en, zh string) string {
	if uiIsChinese() {
		return zh
	}
	return en
}

func trf(en, zh string, args ...any) string {
	if uiIsChinese() {
		return fmt.Sprintf(zh, args...)
	}
	return fmt.Sprintf(en, args...)
}

// SetLanguage switches every backend-generated message. The Settings dialog
// calls it when the language picker changes so errors match the UI.
func (s *SSHService) SetLanguage(lang string) {
	setUILanguage(lang)
}
