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

// NoticeTerms is a plain-words document the sign-up
// checkbox names. Paragraphs are separated by a blank line. Edit it together
// with NoticeVersion.
const NoticeTerms = `3REco connects people who collect recyclable materials with businesses that buy them.

You must give true details and keep your password private. You are responsible for what happens under your account.

Prices, quantities and collection times are agreed between you and the other person. 3REco helps you talk, record the deal and invoice each other. It is not a party to the deal.

Do not use 3REco to cheat, harass or mislead anyone. We may suspend an account that does.

You can ask us to delete your account at any time from your profile.`

// NoticePrivacy is the plain-words privacy notice, written like NoticeTerms.
const NoticePrivacy = `We keep the details you give us: your name, email, phone, address and, if you add them, your ID number and bank details.

ID and bank numbers are stored encrypted. Other people see them only where a trade needs it, and masked unless they are the business that recorded the collector.

3REco admins can read chats between users to resolve disputes and keep the marketplace safe.

We use your details to run your account, match you with trades, send notices about your activity and keep trade records the law requires.

You can download everything we hold about you, or delete your account, from your profile. Trade records are kept for a limited time after deletion.

When this notice changes, we will ask you to accept the new version.`
