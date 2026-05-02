schema/structure of telegram data being provided is as follows:
users                                                                                                                                                                        
  user_id text PRIMARY KEY
  username text, display_name text, bio text, avatar_url text,
  photo_id text, phone_number text, created_at timestamp, updated_at timestamp

  users_by_username
  PRIMARY KEY (username, user_id)
  display_name text, avatar_url text

  chats
  chat_id text PRIMARY KEY
  chat_type text, username text, display_name text, member_count int,
  participants_count int, bio text, avatar_url text, created_at timestamp, updated_at timestamp

  messages_by_chat
  PRIMARY KEY ((chat_id, bucket), timestamp, message_id)  — DESC timestamp
  user_id text, content text, has_media boolean, media_type text,
  media_file_id text, media_url text, created_at timestamp

  messages_by_user
  PRIMARY KEY ((user_id, bucket), timestamp, message_id)  — DESC timestamp
  chat_id text, content text, has_media boolean, media_type text,
  media_url text, created_at timestamp

  messages_by_id
  PRIMARY KEY (chat_id, message_id)
  user_id text, content text, has_media boolean, media_type text,
  media_file_id text, media_url text, timestamp timestamp, created_at timestamp

  user_history
  PRIMARY KEY (user_id, changed_at DESC, field ASC, id ASC)
  old_value text, new_value text

  participation (counter table)
  PRIMARY KEY (user_id, chat_id)
  message_count counter

  participation_meta
  PRIMARY KEY (user_id, chat_id)
  first_message_at timestamp, last_message_at timestamp

  user_daily_stats (counter table)
  PRIMARY KEY (user_id, date DESC)
  message_count counter

  user_word_stats (counter table) — PRIMARY KEY (user_id, word) — count counter

  chat_word_stats (counter table) — PRIMARY KEY (chat_id, word) — count counter

  analytics_cache
  user_id text PRIMARY KEY
  stats text, stats_30d text, chats text, mutuals text,
  most_used_words text, cached_at timestamp

  global_stats (counter table) — PRIMARY KEY (stat_name) — count counter

  media_queue
  message_id text PRIMARY KEY
  chat_id text, status text, claimed_by text, lease_until timestamp,
  retry_count int, created_at timestamp

  media_dead_letter
  message_id text PRIMARY KEY
  chat_id text, retry_count int, last_error text, created_at timestamp, failed_at timestamp

  avatar_queue
  entity_id text PRIMARY KEY
  entity_type text, status text, claimed_by text, lease_until timestamp,
  retry_count int, created_at timestamp



the logger would have the tg scraper/bot process, avatar worker downloading pfps and pushing them to storage box, media queue processor and any api layer/frontend for the "parse tool"
itll be the one talking to telegram and processing queues for media
then you got the primary server (AX42-U) and this one will host cassandra with the entire schema previously mentioned, all user/chat/msgs tables, counter tables, analytics cache, queue tables (media_queue, avatar_queue etc.)
in short its only job is to run cassandra reliably nothing competing for RAM or disk I/O on it
finally the storage box would have cassandra backups of daily, weekly, etc and the avatars
nothing would run on it ofc, just cold storage
theyll talk to eachother like this:
TG API -> Logger VPS writes messages/users/chats -> AX42-U (cassandra) & pushes avatars to the storage box
Then AX42-U (cassandra) nodetool snapshot + rsync -> storage box (backups) and runs nightly via cron
TG OSINT Tool - Full Dev Specification
1. Project Overview
This project is a web-based Telegram intelligence / analytics platform that allows users to search, analyze, and explore Telegram data such as:
Users
Channels
Groups
Messages
The platform operates similarly to an OSINT search engine, where users query a large indexed dataset and view structured analytics about Telegram entities.
The platform is powered entirely by internally collected and indexed data.
Important rule:
Users do not upload any data.
All searches are performed against the system’s internal database and indexes.
The system should include:
Customer-facing search interface
Analytics pages
Credits-based economy
Purchases system
Voucher redemption
Admin panel
Owner redaction controls
The search interface and search types described below follow the design mockups in the provided specification.

2. System Architecture Overview
The system consists of three main components:
Frontend
Web application with:
Search interface
Results pages
User analytics pages
Account dashboard
Credits management
Purchase system
Admin panel
Backend
Responsible for:
Search API
Data querying
Credits ledger
Purchase processing
Voucher redemption
Admin controls
Redaction enforcement
Audit logs
Data Layer
Stores and indexes:
Telegram users
Telegram channels
Telegram groups
Telegram messages
Identity history
Analytics data
User accounts
Credits and purchases

3. Landing Page (Search Interface)
The homepage acts as the primary search interface.
Layout
The page should include:
Top navigation:
Logo
Navigation menu
User account menu
Center search section:
Search Type Selector (tabs or pill buttons)
Main Search Input
Advanced Filters
Search Button
Search types:
Profile
Channel
Group
Message
Changing the search type should dynamically update:
Placeholder text
Advanced filter fields
Search logic
Advanced filters may appear:
Inline below the search bar
or
Inside a collapsible “Filters / Advanced” panel
Pressing Enter or clicking Search executes the search.
cath
3.5 Authentication System
The platform must include a full authentication system for user accounts.
The authentication system should support:
Registration
Users should be able to create an account using:
Email


Password


Registration flow:
User submits registration form


Email validation (optional but recommended)


Account created


User logged in or required to verify email


Stored fields should include:
User ID


Email


Password hash


Account status


Created date


Last login


Passwords must always be securely hashed (bcrypt or equivalent).

Login
Users should be able to log in using:
Email


Password


Login flow:
User submits credentials


Backend validates credentials


Authentication token/session created


User redirected to dashboard


The system should support:
Session-based authentication
 or


JWT authentication


Login security should include:
Rate limiting


Login attempt protection


Optional device/session tracking



Logout
Users should be able to log out.
Logout should:
Invalidate the current session or token


Remove authentication cookies


Redirect to login page



Token Refresh (If Using JWT)
If JWT authentication is used, the system should support:
Short-lived access tokens


Refresh tokens for session renewal


Flow:
Access token expires


Refresh token used to obtain new access token


Session continues without requiring re-login



Password Reset
Users should be able to reset their password.
Password reset flow:
User requests password reset


System sends reset link via email


User sets new password


Old sessions optionally invalidated


Reset tokens should:
Expire after a short period


Be single-use



3.7 User Account Management
Users should have an account management section where they can manage their profile and security settings.
Account Profile
Users should be able to view:
Email address


Account creation date


Account status


Current credit balance


Optional profile fields can include:
Display name


Account preferences



Change Password
Users should be able to change their password.
Flow:
Enter current password


Enter new password


Confirm new password


System updates password hash


Password rules should enforce:
Minimum length


Basic complexity requirements



Two-Factor Authentication (2FA)
The platform should support optional two-factor authentication for additional account security.
Recommended implementation:
TOTP-based authentication (Google Authenticator, Authy, etc.)


2FA setup flow:
User enables 2FA


System generates secret key


QR code displayed


User scans with authenticator app


User confirms verification code


2FA enabled


When enabled, login should require:
Email/password


2FA code


Backup codes should optionally be generated.

Account Deletion
Users should be able to delete their account.
Deletion flow:
User confirms deletion request


System verifies password


Account marked for deletion or permanently removed


Deletion may:
Remove personal account data


Retain financial/transaction records if required for auditing



Balance System
Each user account should maintain a credit balance used for platform purchases.
The balance system should include:
Current balance display


Transaction ledger


Purchase deductions


Voucher credit additions


Admin credit adjustments


Every balance change must:
Generate a transaction record


Be auditable in the system ledger


Balance updates must occur atomically with purchases or voucher redemptions to prevent inconsistencies.


Profile Tracking (Monitoring Feature)
The platform should support a profile tracking / monitoring feature that allows users to subscribe to changes for a specific Telegram profile.
This feature is paid and credit-based.
Cost:
1 credit per month per tracked profile

Tracking Capabilities
When a user subscribes to tracking for a profile, the system should monitor for changes in that profile’s data.
Tracked fields may include:
Username changes


Display name changes


Bio changes


Profile photo changes


Phone number changes (if available internally)


Premium status changes


Group membership changes (optional)



Tracking Workflow
User opens a User Lookup page


User selects “Track Profile”


System checks user balance


System deducts 1 credit


Tracking subscription is created


Monitoring begins


Tracking should renew every 30 days if the user still has credits available.
If the user does not have enough credits:
Tracking should pause


User should be notified



Change Detection
When a monitored field changes:
The system should:
Detect the change


Record it in the identity history database


Notify subscribed users



Notifications
Users should receive notifications when changes occur.
Notification methods may include:
Email notification


In-app notification


Notification panel in dashboard


Notification example:
Profile Update Detected

Username change:
@old_username → @new_username

Profile: user_id 123456
Detected: 2026-03-11

Tracking Management
Users should have a Tracking Dashboard where they can:
View all tracked profiles


See tracking status


Cancel tracking


View change history


Displayed information:
Profile name


User ID


Tracking start date


Last detected change


Renewal date



3.8 Subscription Plans (Recurring Credits)
The platform should support monthly subscription plans that provide users with recurring credits each month.
These plans function similarly to a credit allowance system, where users receive a fixed number of searches or credits every billing cycle.
The UI may resemble the pricing example shown in the design mockup.
Example plans:
Basic
Price: £19 / month
 Credits/Searches: 30 per month
Includes:
Email Search


Phone Search


Username Search


No Captcha



Intermediate
Price: £49 / month
 Credits/Searches: 100 per month
Includes:
Email Search


Phone Search


Username Search


No Captcha


API Access



Advanced
Price: £99 / month
 Credits/Searches: 300 per month
Includes:
Email Search


Phone Search


Username Search


No Captcha


API Access


Dedicated Support



Plan Behavior
Subscription plans should:
Renew automatically every 30 days


Add credits to the user’s balance at renewal


Record the credit addition as a transaction


Allow plan upgrades or cancellations



Billing Cycle
Each subscription should track:
Subscription ID


User ID


Plan type


Monthly credit allocation


Billing start date


Next renewal date


Subscription status


Statuses may include:
Active


Cancelled


Expired


Failed payment



Credit Allocation
At the beginning of each billing cycle:
System adds the plan’s credits to the user balance


A transaction record is created


Credits become available for use


Credits from subscriptions should integrate with the same credits ledger system used for purchases and vouchers.

Subscription Management
Users should be able to:
View their current plan


Upgrade plans


Cancel subscription


View billing history


See next renewal date


Admin panel should allow:
Viewing subscriptions


Manually modifying plans


Cancelling subscriptions


Issuing credits if needed


4. Search Types
4.1 Profile Search
Purpose: locate Telegram users.
Filters:
Username (exact or partial)
Display name (partial)
Phone number (hashed internally — raw number should never be stored or shown)
Bio keywords
User ID
Search behavior:
If input begins with @, prioritize username match
If input contains only digits, prioritize user ID
Otherwise perform fuzzy matching across fields
Results should include:
Username
Display name
Profile photo
Telegram User ID
Basic metadata
Results should be ranked by confidence/relevance.

4.2 Channel Search
Purpose: find Telegram channels.
Filters:
Channel username
Channel title
Channel description
Channel ID
Search behavior:
@handle → prioritize username
Numeric input → prioritize channel ID
Results should show:
Channel title
Username
Subscriber count (if available)
Channel description

4.3 Group Search
Purpose: locate Telegram groups or supergroups.
Filters:
Username (public groups only)
Display name
Description
Chat ID
Results should include:
Group title
Group type (group/supergroup)
Public/private indicator
Activity metrics if available

4.4 Message Search
Purpose: search stored Telegram messages.
Filters:
Sender username
Sender user ID
Chat ID
Keyword
Behavior:
Main search input = message text.
Filters restrict search scope.
Results should include:
Message snippet
Highlighted keywords
Sender
Chat name
Timestamp
Context link

5. Search Execution Rules
Search should trigger when:
Enter is pressed
Search button is clicked
Rules:
If advanced filters are empty → use main query
If main query is empty but filters exist → search should still run
Example:
Searching by User ID only should work.

6. Results Handling
After executing a search:
Results should appear:
On a dedicated results page
or
Below the search bar dynamically
Results should be:
Ranked by relevance
Grouped by search type
Clicking results should open:
Result Type
Destination
Profile
User Lookup page
Channel
Channel details page
Group
Group details page
Message
Message detail view


7. User Lookup Page
The User Lookup page displays analytics about a Telegram user.
User Summary
Shows:
Profile photo
Display name
Username
Telegram User ID
Premium status
Tracking status
First seen / last seen
Identity History
Tracks historical changes:
Display name history
Username history
Bio history
Phone number history

8. Analytics Panels
Active Chats
Shows chats where the user participates:
Chat ID
Chat name
Message counts
Frequently Used Words
Displays most common words used by the user.
Stop words like:
the
and
is
should be filtered out.
Groups
Groups where the user is active with message counts.
Channels
Channels the user participates in or interacts with.

9. Message Lookup Interface
A dedicated interface for searching messages.
Modes:
User Search
Search messages from a specific user.
Inputs:
Username
User ID
Scope options:
All chats
Specific chats

Text Search
Search messages by keyword.
Filters:
Chat scope
Specific user
Date range
Has media
Contains links
Minimum length
Results should highlight keywords.

Group/Channel Search
Search messages within a specific chat.
Filters:
Chat ID
Date range
User filter
Keyword filter
Results should support:
Infinite scrolling
Virtualized lists for performance

10. Credits System
The platform uses a credits-based economy, similar to OSINT platforms.
Users should be able to:
View balance
View transactions
Redeem vouchers
Purchase products/features using credits
Credit Balance
Displays current available credits.
Transactions
Ledger-style history showing:
Date
Type
Amount
Status
Reference
Notes
Transaction types:
Purchase debit
Voucher redemption
Admin adjustment
Refund
Promotional credits

11. Voucher Redemption
Users can redeem voucher codes for credits.
Voucher process:
User enters code
System validates code
Credits added
Voucher marked redeemed
Transaction recorded
Voucher settings should support:
Expiration date
Usage limits
Single-use or multi-use
Active/inactive state

12. Purchases System
Users can purchase items using credits.
Possible purchases:
Data unlocks
Advanced analytics
Export features
Tracking features
Premium searches
Purchase Flow
User selects item
System checks credits
Credits deducted
Purchase recorded
Access granted

Purchase History
Users should see:
Purchase ID
Date
Item name
Credit cost
Status

Purchase Detail
Each purchase should show:
Purchase information
Cost
Timestamp
Related credit transaction
Internal reference ID

13. Admin Panel
The platform must include a full admin panel.
Main modules:
User Management
Admins should be able to:
Search users
View user accounts
Suspend/ban users
View balances
View purchases
View transactions

Credit Adjustments
Admins should be able to:
Add credits
Remove credits
Set balances
Add reason/notes
Every adjustment must create a ledger entry.

Voucher Management
Admins should be able to:
Create vouchers
Edit vouchers
Disable vouchers
Track redemptions

Purchases Oversight
Admins should be able to:
View all purchases
Filter purchases
Inspect purchase details
Refund purchases if necessary

Audit Logs
Admin actions must be logged.
Log entries should include:
Admin ID
Action type
Target entity
Before/after values
Timestamp

14. Owner Redaction System
The platform owner must be able to redact user data.
Redaction allows hiding data from users while keeping internal access.
Redaction Types
Full Entity Redaction
Completely hide a user from search results.
Partial Redaction
Hide specific fields:
Username
Bio
Profile photo
Message history
Group associations
Masked Results
Instead of removing records entirely, results may show:
"Record unavailable"
or
"Data redacted"

Redaction Enforcement
Redactions must be applied:
In the API
In search results
In exports
In analytics pages
Admins may still view redacted records internally.

15. User Roles
Suggested permission structure.
Owner
Full control of:
Redactions
Admin panel
Credits
Purchases
Vouchers
Audit logs
Customer
Can only access:
Search tools
Own account
Credits
Purchases
Voucher redemption

16. API Design
Suggested unified search endpoint.
GET /search
Parameters:
type=profile|channel|group|message
q=<query>

profile filters:
username
display_name
number
bio
user_id

channel/group filters:
username
display_name
bio
chat_id

message filters:
username
user_id
chat_id
keyword
Additional API modules:
Auth
Search
Credits
Purchases
Admin

17. Core Business Rules
Credits:
Every balance change must create a transaction record
No silent balance changes
Purchases:
Purchases must fail if credits are insufficient
Purchase + credit deduction must occur in a single transaction
Redactions:
Must be enforced server-side
Must apply to search, analytics, and exports
Admin actions:
Must be logged.


