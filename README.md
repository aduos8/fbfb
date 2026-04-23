# schema/structure of telegram data being provided is as follows:

users                                                                                                                                                                          
  user\_id text PRIMARY KEY  
  username text, display\_name text, bio text, avatar\_url text,  
  photo\_id text, phone\_number text, created\_at timestamp, updated\_at timestamp

  users\_by\_username  
  PRIMARY KEY (username, user\_id)  
  display\_name text, avatar\_url text

  chats  
  chat\_id text PRIMARY KEY  
  chat\_type text, username text, display\_name text, member\_count int,  
  participants\_count int, bio text, avatar\_url text, created\_at timestamp, updated\_at timestamp

  messages\_by\_chat  
  PRIMARY KEY ((chat\_id, bucket), timestamp, message\_id)  — DESC timestamp  
  user\_id text, content text, has\_media boolean, media\_type text,  
  media\_file\_id text, media\_url text, created\_at timestamp

  messages\_by\_user  
  PRIMARY KEY ((user\_id, bucket), timestamp, message\_id)  — DESC timestamp  
  chat\_id text, content text, has\_media boolean, media\_type text,  
  media\_url text, created\_at timestamp

  messages\_by\_id  
  PRIMARY KEY (chat\_id, message\_id)  
  user\_id text, content text, has\_media boolean, media\_type text,  
  media\_file\_id text, media\_url text, timestamp timestamp, created\_at timestamp

  user\_history  
  PRIMARY KEY (user\_id, changed\_at DESC, field ASC, id ASC)  
  old\_value text, new\_value text

  participation (counter table)  
  PRIMARY KEY (user\_id, chat\_id)  
  message\_count counter

  participation\_meta  
  PRIMARY KEY (user\_id, chat\_id)  
  first\_message\_at timestamp, last\_message\_at timestamp

  user\_daily\_stats (counter table)  
  PRIMARY KEY (user\_id, date DESC)  
  message\_count counter

  user\_word\_stats (counter table) — PRIMARY KEY (user\_id, word) — count counter

  chat\_word\_stats (counter table) — PRIMARY KEY (chat\_id, word) — count counter

  analytics\_cache  
  user\_id text PRIMARY KEY  
  stats text, stats\_30d text, chats text, mutuals text,  
  most\_used\_words text, cached\_at timestamp

  global\_stats (counter table) — PRIMARY KEY (stat\_name) — count counter

  media\_queue  
  message\_id text PRIMARY KEY  
  chat\_id text, status text, claimed\_by text, lease\_until timestamp,  
  retry\_count int, created\_at timestamp

  media\_dead\_letter  
  message\_id text PRIMARY KEY  
  chat\_id text, retry\_count int, last\_error text, created\_at timestamp, failed\_at timestamp

  avatar\_queue  
  entity\_id text PRIMARY KEY  
  entity\_type text, status text, claimed\_by text, lease\_until timestamp,  
  retry\_count int, created\_at timestamp

# 

# the logger would have the tg scraper/bot process, avatar worker downloading pfps and pushing them to storage box, media queue processor and any api layer/frontend for the "parse tool"

# itll be the one talking to telegram and processing queues for media

# then you got the primary server (AX42-U) and this one will host cassandra with the entire schema previously mentioned, all user/chat/msgs tables, counter tables, analytics cache, queue tables (media\_queue, avatar\_queue etc.)

# in short its only job is to run cassandra reliably nothing competing for RAM or disk I/O on it

# finally the storage box would have cassandra backups of daily, weekly, etc and the avatars

# nothing would run on it ofc, just cold storage

# theyll talk to eachother like this:

# TG API \-\> Logger VPS writes messages/users/chats \-\> AX42-U (cassandra) & pushes avatars to the storage box

# Then AX42-U (cassandra) nodetool snapshot \+ rsync \-\> storage box (backups) and runs nightly via cron

# **TG OSINT Tool \- Full Dev Specification**

## **1\. Project Overview**

This project is a **web-based Telegram intelligence / analytics platform** that allows users to search, analyze, and explore Telegram data such as:

* Users  
* Channels  
* Groups  
* Messages

The platform operates similarly to an **OSINT search engine**, where users query a large indexed dataset and view structured analytics about Telegram entities.

The platform is powered entirely by **internally collected and indexed data**.

Important rule:

**Users do not upload any data.**

All searches are performed against the system’s internal database and indexes.

The system should include:

* Customer-facing search interface  
* Analytics pages  
* Credits-based economy  
* Purchases system  
* Voucher redemption  
* Admin panel  
* Owner redaction controls

The search interface and search types described below follow the design mockups in the provided specification.

---

# **2\. System Architecture Overview**

The system consists of three main components:

## **Frontend**

Web application with:

* Search interface  
* Results pages  
* User analytics pages  
* Account dashboard  
* Credits management  
* Purchase system  
* Admin panel

## **Backend**

Responsible for:

* Search API  
* Data querying  
* Credits ledger  
* Purchase processing  
* Voucher redemption  
* Admin controls  
* Redaction enforcement  
* Audit logs

## **Data Layer**

Stores and indexes:

* Telegram users  
* Telegram channels  
* Telegram groups  
* Telegram messages  
* Identity history  
* Analytics data  
* User accounts  
* Credits and purchases

---

# **2.5 Search Backend Operations**

The application now supports two search backends:

* **OpenSearch** (default)
* **Meilisearch** (legacy fallback)

Backend selection is controlled with:

```bash
SEARCH_BACKEND=opensearch
```

OpenSearch configuration:

```bash
OPENSEARCH_URL=http://opensearch:9200
OPENSEARCH_USERNAME=
OPENSEARCH_PASSWORD=
```

Meilisearch fallback configuration:

```bash
SEARCH_BACKEND=meilisearch
MEILISEARCH_URL=http://meilisearch:7700
MEILISEARCH_API_KEY=change_me
```

## **Initial full indexing runbook**

1. Start PostgreSQL, Cassandra access, and OpenSearch.
   Local example:
   `docker compose -f docker-compose.local.yml up -d postgres opensearch`
2. Apply database migrations:
   `bun run db:migrate`
3. Configure the search backend:
   `bun run search:configure`
4. Run the first full Cassandra -> search load:
   `bun run search:reindex`
5. Start incremental sync processing:
   `bun run search:sync`

For a one-shot bootstrap that runs migrations, configures the backend, and performs the first full reindex:

```bash
bun run search:bootstrap
```

## **Scoped rebuilds**

You can rebuild only selected scopes:

```bash
bun run search:reindex --scopes=messages
bun run search:reindex --scopes=profiles,chats
```

If a full reindex stops midway, you can resume it against the same shadow indexes:

```bash
bun run search:reindex --resume
bun run search:reindex --resume --run-id=<search_index_run_uuid>
```

Resume uses the scopes stored on the original run. If messages were already swapped live early, resume continues the remaining scopes without redoing the live message corpus.

Incremental sync can also be scoped:

```bash
bun run search:sync --scopes=messages
```

## **OpenSearch behavior**

* OpenSearch is configured with stable live aliases: `profiles`, `chats`, `messages`
* Full reindex creates shadow aliases, loads data into shadow backing indexes, validates counts, and atomically swaps aliases live
* Health checks treat OpenSearch `green` and `yellow` as healthy so single-node deployments pass readiness checks
* After a successful swap, old backing indexes behind the shadow aliases are pruned automatically when `SEARCH_INDEX_AUTO_PRUNE_SHADOW_INDEXES=true`

## **Docker defaults**

`docker-compose.local.yml` and `docker-compose.coolify.yml` now default to:

* `SEARCH_BACKEND=opensearch`
* `OPENSEARCH_URL=http://opensearch:9200`
* single-node OpenSearch on port `9200`

## **Rollback to Meilisearch**

If you need to switch back:

1. Set `SEARCH_BACKEND=meilisearch`
2. Provide `MEILISEARCH_URL` and `MEILISEARCH_API_KEY`
3. Run `bun run search:configure`
4. Run `bun run search:reindex`
5. Resume `bun run search:sync`

---

# **3\. Landing Page (Search Interface)**

The homepage acts as the **primary search interface**.

### **Layout**

The page should include:

Top navigation:

* Logo  
* Navigation menu  
* User account menu

Center search section:

* Search Type Selector (tabs or pill buttons)  
* Main Search Input  
* Advanced Filters  
* Search Button

Search types:

* Profile  
* Channel  
* Group  
* Message

Changing the search type should dynamically update:

* Placeholder text  
* Advanced filter fields  
* Search logic

Advanced filters may appear:

* Inline below the search bar  
  or  
* Inside a collapsible “Filters / Advanced” panel

Pressing **Enter** or clicking **Search** executes the search.

cath

# **3.5 Authentication System**

The platform must include a full authentication system for user accounts.

The authentication system should support:

### **Registration**

Users should be able to create an account using:

* Email

* Password

Registration flow:

1. User submits registration form

2. Email validation (optional but recommended)

3. Account created

4. User logged in or required to verify email

Stored fields should include:

* User ID

* Email

* Password hash

* Account status

* Created date

* Last login

Passwords must always be **securely hashed** (bcrypt or equivalent).

---

### **Login**

Users should be able to log in using:

* Email

* Password

Login flow:

1. User submits credentials

2. Backend validates credentials

3. Authentication token/session created

4. User redirected to dashboard

The system should support:

* Session-based authentication  
   or

* JWT authentication

Login security should include:

* Rate limiting

* Login attempt protection

* Optional device/session tracking

---

### **Logout**

Users should be able to log out.

Logout should:

* Invalidate the current session or token

* Remove authentication cookies

* Redirect to login page

---

### **Token Refresh (If Using JWT)**

If JWT authentication is used, the system should support:

* Short-lived access tokens

* Refresh tokens for session renewal

Flow:

1. Access token expires

2. Refresh token used to obtain new access token

3. Session continues without requiring re-login

---

### **Password Reset**

Users should be able to reset their password.

Password reset flow:

1. User requests password reset

2. System sends reset link via email

3. User sets new password

4. Old sessions optionally invalidated

Reset tokens should:

* Expire after a short period

* Be single-use

---

# **3.7 User Account Management**

Users should have an account management section where they can manage their profile and security settings.

### **Account Profile**

Users should be able to view:

* Email address

* Account creation date

* Account status

* Current credit balance

Optional profile fields can include:

* Display name

* Account preferences

---

### **Change Password**

Users should be able to change their password.

Flow:

1. Enter current password

2. Enter new password

3. Confirm new password

4. System updates password hash

Password rules should enforce:

* Minimum length

* Basic complexity requirements

---

### **Two-Factor Authentication (2FA)**

The platform should support optional **two-factor authentication** for additional account security.

Recommended implementation:

* TOTP-based authentication (Google Authenticator, Authy, etc.)

2FA setup flow:

1. User enables 2FA

2. System generates secret key

3. QR code displayed

4. User scans with authenticator app

5. User confirms verification code

6. 2FA enabled

When enabled, login should require:

* Email/password

* 2FA code

Backup codes should optionally be generated.

---

### **Account Deletion**

Users should be able to delete their account.

Deletion flow:

1. User confirms deletion request

2. System verifies password

3. Account marked for deletion or permanently removed

Deletion may:

* Remove personal account data

* Retain financial/transaction records if required for auditing

---

### **Balance System**

Each user account should maintain a **credit balance** used for platform purchases.

The balance system should include:

* Current balance display

* Transaction ledger

* Purchase deductions

* Voucher credit additions

* Admin credit adjustments

Every balance change must:

* Generate a transaction record

* Be auditable in the system ledger

Balance updates must occur **atomically with purchases or voucher redemptions** to prevent inconsistencies.

---

# **Profile Tracking (Monitoring Feature)**

The platform should support a **profile tracking / monitoring feature** that allows users to subscribe to changes for a specific Telegram profile.

This feature is **paid and credit-based**.

Cost:

**1 credit per month per tracked profile**

---

## **Tracking Capabilities**

When a user subscribes to tracking for a profile, the system should monitor for changes in that profile’s data.

Tracked fields may include:

* Username changes

* Display name changes

* Bio changes

* Profile photo changes

* Phone number changes (if available internally)

* Premium status changes

* Group membership changes (optional)

---

## **Tracking Workflow**

1. User opens a **User Lookup page**

2. User selects **“Track Profile”**

3. System checks user balance

4. System deducts **1 credit**

5. Tracking subscription is created

6. Monitoring begins

Tracking should renew **every 30 days** if the user still has credits available.

If the user does not have enough credits:

* Tracking should pause

* User should be notified

---

## **Change Detection**

When a monitored field changes:

The system should:

1. Detect the change

2. Record it in the identity history database

3. Notify subscribed users

---

## **Notifications**

Users should receive notifications when changes occur.

Notification methods may include:

* Email notification

* In-app notification

* Notification panel in dashboard

Notification example:

Profile Update Detected

Username change:  
@old\_username → @new\_username

Profile: user\_id 123456  
Detected: 2026-03-11  
---

## **Tracking Management**

Users should have a **Tracking Dashboard** where they can:

* View all tracked profiles

* See tracking status

* Cancel tracking

* View change history

Displayed information:

* Profile name

* User ID

* Tracking start date

* Last detected change

* Renewal date

---

# **3.8 Subscription Plans (Recurring Credits)**

The platform should support **monthly subscription plans** that provide users with recurring credits each month.

These plans function similarly to a **credit allowance system**, where users receive a fixed number of searches or credits every billing cycle.

The UI may resemble the pricing example shown in the design mockup.

Example plans:

### **Basic**

Price: £19 / month  
 Credits/Searches: 30 per month

Includes:

* Email Search

* Phone Search

* Username Search

* No Captcha

---

### **Intermediate**

Price: £49 / month  
 Credits/Searches: 100 per month

Includes:

* Email Search

* Phone Search

* Username Search

* No Captcha

* API Access

---

### **Advanced**

Price: £99 / month  
 Credits/Searches: 300 per month

Includes:

* Email Search

* Phone Search

* Username Search

* No Captcha

* API Access

* Dedicated Support

---

## **Plan Behavior**

Subscription plans should:

* Renew automatically every 30 days

* Add credits to the user’s balance at renewal

* Record the credit addition as a transaction

* Allow plan upgrades or cancellations

---

## **Billing Cycle**

Each subscription should track:

* Subscription ID

* User ID

* Plan type

* Monthly credit allocation

* Billing start date

* Next renewal date

* Subscription status

Statuses may include:

* Active

* Cancelled

* Expired

* Failed payment

---

## **Credit Allocation**

At the beginning of each billing cycle:

1. System adds the plan’s credits to the user balance

2. A **transaction record** is created

3. Credits become available for use

Credits from subscriptions should integrate with the same **credits ledger system** used for purchases and vouchers.

---

## **Subscription Management**

Users should be able to:

* View their current plan

* Upgrade plans

* Cancel subscription

* View billing history

* See next renewal date

Admin panel should allow:

* Viewing subscriptions

* Manually modifying plans

* Cancelling subscriptions

* Issuing credits if needed

---

# **4\. Search Types**

## **4.1 Profile Search**

Purpose: locate Telegram users.

Filters:

* Username (exact or partial)  
* Display name (partial)  
* Phone number (hashed internally — raw number should never be stored or shown)  
* Bio keywords  
* User ID

Search behavior:

* If input begins with `@`, prioritize username match  
* If input contains only digits, prioritize user ID  
* Otherwise perform fuzzy matching across fields

Results should include:

* Username  
* Display name  
* Profile photo  
* Telegram User ID  
* Basic metadata

Results should be ranked by **confidence/relevance**.

---

## **4.2 Channel Search**

Purpose: find Telegram channels.

Filters:

* Channel username  
* Channel title  
* Channel description  
* Channel ID

Search behavior:

* `@handle` → prioritize username  
* Numeric input → prioritize channel ID

Results should show:

* Channel title  
* Username  
* Subscriber count (if available)  
* Channel description

---

## **4.3 Group Search**

Purpose: locate Telegram groups or supergroups.

Filters:

* Username (public groups only)  
* Display name  
* Description  
* Chat ID

Results should include:

* Group title  
* Group type (group/supergroup)  
* Public/private indicator  
* Activity metrics if available

---

## **4.4 Message Search**

Purpose: search stored Telegram messages.

Filters:

* Sender username  
* Sender user ID  
* Chat ID  
* Keyword

Behavior:

Main search input \= message text.

Filters restrict search scope.

Results should include:

* Message snippet  
* Highlighted keywords  
* Sender  
* Chat name  
* Timestamp  
* Context link

---

# **5\. Search Execution Rules**

Search should trigger when:

* Enter is pressed  
* Search button is clicked

Rules:

* If advanced filters are empty → use main query  
* If main query is empty but filters exist → search should still run

Example:

Searching by **User ID only** should work.

---

# **6\. Results Handling**

After executing a search:

Results should appear:

* On a dedicated results page  
  or  
* Below the search bar dynamically

Results should be:

* Ranked by relevance  
* Grouped by search type

Clicking results should open:

| Result Type | Destination |
| ----- | ----- |
| Profile | User Lookup page |
| Channel | Channel details page |
| Group | Group details page |
| Message | Message detail view |

---

# **7\. User Lookup Page**

The User Lookup page displays analytics about a Telegram user.

### **User Summary**

Shows:

* Profile photo  
* Display name  
* Username  
* Telegram User ID  
* Premium status  
* Tracking status  
* First seen / last seen

### **Identity History**

Tracks historical changes:

* Display name history  
* Username history  
* Bio history  
* Phone number history

---

# **8\. Analytics Panels**

### **Active Chats**

Shows chats where the user participates:

* Chat ID  
* Chat name  
* Message counts

### **Frequently Used Words**

Displays most common words used by the user.

Stop words like:

* the  
* and  
* is

should be filtered out.

### **Groups**

Groups where the user is active with message counts.

### **Channels**

Channels the user participates in or interacts with.

---

# **9\. Message Lookup Interface**

A dedicated interface for searching messages.

Modes:

### **User Search**

Search messages from a specific user.

Inputs:

* Username  
* User ID

Scope options:

* All chats  
* Specific chats

---

### **Text Search**

Search messages by keyword.

Filters:

* Chat scope  
* Specific user  
* Date range  
* Has media  
* Contains links  
* Minimum length

Results should highlight keywords.

---

### **Group/Channel Search**

Search messages within a specific chat.

Filters:

* Chat ID  
* Date range  
* User filter  
* Keyword filter

Results should support:

* Infinite scrolling  
* Virtualized lists for performance

---

# **10\. Credits System**

The platform uses a **credits-based economy**, similar to OSINT platforms.

Users should be able to:

* View balance  
* View transactions  
* Redeem vouchers  
* Purchase products/features using credits

### **Credit Balance**

Displays current available credits.

### **Transactions**

Ledger-style history showing:

* Date  
* Type  
* Amount  
* Status  
* Reference  
* Notes

Transaction types:

* Purchase debit  
* Voucher redemption  
* Admin adjustment  
* Refund  
* Promotional credits

---

# **11\. Voucher Redemption**

Users can redeem voucher codes for credits.

Voucher process:

1. User enters code  
2. System validates code  
3. Credits added  
4. Voucher marked redeemed  
5. Transaction recorded

Voucher settings should support:

* Expiration date  
* Usage limits  
* Single-use or multi-use  
* Active/inactive state

---

# **12\. Purchases System**

Users can purchase items using credits.

Possible purchases:

* Data unlocks  
* Advanced analytics  
* Export features  
* Tracking features  
* Premium searches

### **Purchase Flow**

1. User selects item  
2. System checks credits  
3. Credits deducted  
4. Purchase recorded  
5. Access granted

---

### **Purchase History**

Users should see:

* Purchase ID  
* Date  
* Item name  
* Credit cost  
* Status

---

### **Purchase Detail**

Each purchase should show:

* Purchase information  
* Cost  
* Timestamp  
* Related credit transaction  
* Internal reference ID

---

# **13\. Admin Panel**

The platform must include a full admin panel.

Main modules:

### **User Management**

Admins should be able to:

* Search users  
* View user accounts  
* Suspend/ban users  
* View balances  
* View purchases  
* View transactions

---

### **Credit Adjustments**

Admins should be able to:

* Add credits  
* Remove credits  
* Set balances  
* Add reason/notes

Every adjustment must create a **ledger entry**.

---

### **Voucher Management**

Admins should be able to:

* Create vouchers  
* Edit vouchers  
* Disable vouchers  
* Track redemptions

---

### **Purchases Oversight**

Admins should be able to:

* View all purchases  
* Filter purchases  
* Inspect purchase details  
* Refund purchases if necessary

---

### **Audit Logs**

Admin actions must be logged.

Log entries should include:

* Admin ID  
* Action type  
* Target entity  
* Before/after values  
* Timestamp

---

# **14\. Owner Redaction System**

The platform owner must be able to **redact user data**.

Redaction allows hiding data from users while keeping internal access.

## **Redaction Types**

### **Full Entity Redaction**

Completely hide a user from search results.

### **Partial Redaction**

Hide specific fields:

* Username  
* Bio  
* Profile photo  
* Message history  
* Group associations

### **Masked Results**

Instead of removing records entirely, results may show:

"Record unavailable"  
or  
"Data redacted"

---

## **Redaction Enforcement**

Redactions must be applied:

* In the API  
* In search results  
* In exports  
* In analytics pages

Admins may still view redacted records internally.

---

# **15\. User Roles**

Suggested permission structure.

### **Owner**

Full control of:

* Redactions  
* Admin panel  
* Credits  
* Purchases  
* Vouchers  
* Audit logs

### **Customer**

Can only access:

* Search tools  
* Own account  
* Credits  
* Purchases  
* Voucher redemption

---

# **16\. API Design**

Suggested unified search endpoint.

GET /search

Parameters:

type=profile|channel|group|message  
q=\<query\>

profile filters:  
username  
display\_name  
number  
bio  
user\_id

channel/group filters:  
username  
display\_name  
bio  
chat\_id

message filters:  
username  
user\_id  
chat\_id  
keyword

Additional API modules:

Auth  
Search  
Credits  
Purchases  
Admin

---

# **17\. Core Business Rules**

Credits:

* Every balance change must create a transaction record  
* No silent balance changes

Purchases:

* Purchases must fail if credits are insufficient  
* Purchase \+ credit deduction must occur in a single transaction

Redactions:

* Must be enforced server-side  
* Must apply to search, analytics, and exports

Admin actions:

* Must be logged.
