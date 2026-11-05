package config

// NoticeVersion is the privacy notice people must accept at sign-up. Change it
// when the notice changes; everyone is then asked again.
const NoticeVersion = "2026-11"

// Retention periods, used by the hourly privacy job in services/privacy.
const (
	NotificationRetentionDays  = 90
	CartRetentionDays          = 90
	TradeRetentionYears        = 5
	PrivacyEventRetentionYears = 2
)
