# FitSync — Supabase Auth Email Setup

## 1. Confirm the app URL
In Supabase Dashboard → Authentication → URL Configuration:
- Site URL: your Vercel production URL
- Redirect URL: your Vercel production URL

## 2. Enable email confirmation
Authentication → Providers → Email → keep Email enabled and require email confirmation for production accounts.

## 3. Branded confirmation email
Authentication → Email Templates → Confirm signup.

**Subject**
Welcome to FitSync — Verify your email

**HTML body**
```html
<div style="font-family:Inter,Arial,sans-serif;background:#f4f7f1;padding:40px 16px;color:#172019;">
  <div style="max-width:560px;margin:auto;background:#ffffff;border:1px solid #dfe7d8;border-radius:20px;padding:36px;">
    <div style="font-size:24px;font-weight:900;letter-spacing:.08em;color:#5a9d12;">FITSYNC</div>
    <p style="font-size:12px;color:#71806f;letter-spacing:.12em;font-weight:800;">TRACK • PLAN • EAT • TRAIN • IMPROVE</p>
    <h1 style="font-size:30px;margin:28px 0 10px;">Welcome to FitSync 👋</h1>
    <p style="font-size:16px;line-height:1.6;">Your account is ready. Verify your email address to activate your FitSync account and continue to your personalized fitness journey.</p>
    <p style="margin:28px 0;"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#5a9d12;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:12px;font-weight:800;">Verify my email</a></p>
    <p style="font-size:13px;line-height:1.6;color:#68736b;">If you did not create a FitSync account, you can safely ignore this email.</p>
    <div style="margin-top:30px;padding-top:20px;border-top:1px solid #e5ebe1;font-size:12px;color:#7a847c;">Train smarter. Eat better. Recover stronger.<br><strong>FitSync Team</strong></div>
  </div>
</div>
```

## 4. Important Free-tier note
New Supabase Free projects using Supabase's default SMTP may not allow custom auth email templates. If the Email Templates editor is restricted, configure a custom SMTP provider (for example Resend, Postmark, SendGrid, or Amazon SES) or use a paid Supabase plan.

## 5. Test
Create a new account in FitSync → confirm that the branded email arrives → click Verify my email → return to FitSync → log in.

Never put an SMTP password, Supabase secret/service-role key, or OpenAI API key in the frontend files.
