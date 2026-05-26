package acp

import (
	"regexp"
	"strings"
)

// SensitiveMatch describes a sensitive operation detection result.
// Design Doc Section 6: HITL interception requires real-time parsing of
// agent commands to detect risky operations (rm, make build, network requests).
type SensitiveMatch struct {
	Matched  bool
	Pattern  string // human-readable rule name (e.g. "rm-recursive", "shell-curl")
	Severity string // "high" | "medium" | "low"
	Reason   string // raw matched substring or explanation
}

// SensitivePattern is a single classification rule.
type SensitivePattern struct {
	Name     string
	Severity string
	Regex    *regexp.Regexp
}

// SensitiveDetector classifies tool calls and prompt text against a list of
// regex-based rules. Zero value is unusable — use NewSensitiveDetector.
type SensitiveDetector struct {
	patterns []SensitivePattern
}

// NewSensitiveDetector returns a detector preloaded with default rules.
func NewSensitiveDetector() *SensitiveDetector {
	return &SensitiveDetector{patterns: defaultSensitivePatterns()}
}

// defaultSensitivePatterns covers the Design Doc S6 categories:
//   - destructive filesystem (rm, mv to /, chmod 777)
//   - build/install side effects (make, sudo, apt, npm install -g)
//   - network egress (curl, wget, ssh, scp)
//   - privileged shells (sudo, su, exec)
func defaultSensitivePatterns() []SensitivePattern {
	return []SensitivePattern{
		{Name: "rm-recursive", Severity: "high", Regex: regexp.MustCompile(`\brm\s+(-[rRf]+\s+|-[rRf]+\b)`)},
		{Name: "rm-root", Severity: "high", Regex: regexp.MustCompile(`\brm\s+[^\n]*\s+/(\s|$)`)},
		{Name: "chmod-777", Severity: "high", Regex: regexp.MustCompile(`\bchmod\s+(-R\s+)?777\b`)},
		{Name: "sudo", Severity: "high", Regex: regexp.MustCompile(`\bsudo\b`)},
		{Name: "su-root", Severity: "high", Regex: regexp.MustCompile(`\bsu\s+(-\s+)?root\b`)},
		{Name: "make-build", Severity: "medium", Regex: regexp.MustCompile(`\bmake\s+(build|install|deploy|publish)\b`)},
		{Name: "package-install-global", Severity: "medium", Regex: regexp.MustCompile(`\b(npm|yarn|pnpm)\s+(install|add)\s+(-g|--global)\b`)},
		{Name: "apt-install", Severity: "medium", Regex: regexp.MustCompile(`\b(apt|apt-get|yum|dnf|pacman)\s+(install|remove|purge)\b`)},
		{Name: "curl-pipe-sh", Severity: "high", Regex: regexp.MustCompile(`\bcurl\b[^\n]*\|\s*(sh|bash|zsh)\b`)},
		{Name: "wget-pipe-sh", Severity: "high", Regex: regexp.MustCompile(`\bwget\b[^\n]*\|\s*(sh|bash|zsh)\b`)},
		{Name: "shell-curl", Severity: "medium", Regex: regexp.MustCompile(`\bcurl\s+[^\n]*\bhttp`)},
		{Name: "shell-wget", Severity: "medium", Regex: regexp.MustCompile(`\bwget\s+[^\n]*\bhttp`)},
		{Name: "ssh-remote", Severity: "medium", Regex: regexp.MustCompile(`\bssh\s+[a-zA-Z0-9._@-]+`)},
		{Name: "scp-remote", Severity: "medium", Regex: regexp.MustCompile(`\bscp\s+`)},
		{Name: "git-push-force", Severity: "high", Regex: regexp.MustCompile(`\bgit\s+push\s+(-f|--force)\b`)},
		{Name: "docker-run", Severity: "low", Regex: regexp.MustCompile(`\bdocker\s+(run|exec|build)\b`)},
		{Name: "kubectl-apply", Severity: "medium", Regex: regexp.MustCompile(`\bkubectl\s+(apply|delete|drain)\b`)},
		{Name: "dd-block", Severity: "high", Regex: regexp.MustCompile(`\bdd\s+if=`)},
		{Name: "mkfs", Severity: "high", Regex: regexp.MustCompile(`\bmkfs(\.[a-z0-9]+)?\b`)},
	}
}

// Check runs all patterns against text. Returns the first match (highest
// rule precedence by list order) or {Matched: false} if nothing matched.
func (d *SensitiveDetector) Check(text string) SensitiveMatch {
	if d == nil || text == "" {
		return SensitiveMatch{}
	}
	for _, p := range d.patterns {
		if loc := p.Regex.FindStringIndex(text); loc != nil {
			snippet := strings.TrimSpace(text[loc[0]:loc[1]])
			return SensitiveMatch{
				Matched:  true,
				Pattern:  p.Name,
				Severity: p.Severity,
				Reason:   snippet,
			}
		}
	}
	return SensitiveMatch{}
}

// CheckAll returns every matching rule (useful for audit logging).
func (d *SensitiveDetector) CheckAll(text string) []SensitiveMatch {
	if d == nil || text == "" {
		return nil
	}
	var matches []SensitiveMatch
	for _, p := range d.patterns {
		if loc := p.Regex.FindStringIndex(text); loc != nil {
			matches = append(matches, SensitiveMatch{
				Matched:  true,
				Pattern:  p.Name,
				Severity: p.Severity,
				Reason:   strings.TrimSpace(text[loc[0]:loc[1]]),
			})
		}
	}
	return matches
}

// AddPattern appends a custom rule (e.g. project-specific deny list).
func (d *SensitiveDetector) AddPattern(name, severity, expr string) error {
	re, err := regexp.Compile(expr)
	if err != nil {
		return err
	}
	d.patterns = append(d.patterns, SensitivePattern{
		Name:     name,
		Severity: severity,
		Regex:    re,
	})
	return nil
}

// PatternCount returns the number of active rules.
func (d *SensitiveDetector) PatternCount() int {
	if d == nil {
		return 0
	}
	return len(d.patterns)
}
