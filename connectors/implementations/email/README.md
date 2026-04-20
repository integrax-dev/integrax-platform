# @integrax/connector-email

Email/SMTP connector for transactional and bulk email. Supports direct SMTP, Gmail, Outlook, SendGrid, SES, and Mailgun.

**Auth:** SMTP credentials (host/port/user/pass) or provider-specific API key.

**Actions:** send email, send with template (variable substitution), send with attachments.

**Dependencies:** `@integrax/connector-sdk`, `nodemailer`.

**Consumers:** `services/control-plane` tester registry, `packages/adapters` (`SmtpEmailAdapter`), notification workflows.
