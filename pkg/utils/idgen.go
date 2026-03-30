// Package utils provides common utilities
package utils

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync/atomic"
	"time"
)

var idCounter atomic.Uint64

// GenerateID creates a unique ID with prefix using crypto/rand.
// Format: {prefix}_{timestamp}_{random}_{counter}
// This is safe for high-concurrency scenarios and resistant to collision attacks.
func GenerateID(prefix string) string {
	// 4 bytes random from crypto/rand
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand.Read failure on Linux is extremely rare (requires /dev/urandom unavailable),
		// but panic is appropriate since proceeding with zero bytes would produce predictable IDs
		panic(fmt.Sprintf("crypto/rand.Read failed: %v", err))
	}

	return fmt.Sprintf("%s_%d_%s_%04x",
		prefix,
		time.Now().UnixNano(),
		hex.EncodeToString(b),
		idCounter.Add(1)%0x10000,
	)
}

// GenerateShortID creates a shorter ID with prefix (8 random hex chars).
// Suitable for cases where brevity is more important than absolute uniqueness.
func GenerateShortID(prefix string) string {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		panic(fmt.Sprintf("crypto/rand.Read failed: %v", err))
	}
	return prefix + "_" + hex.EncodeToString(b)
}
