# Mensa Movie Bot

هذه حزمة البوت والبورتال فقط. لا ترفعها إلى Netlify.

```bash
npm install
cp .env.example .env
npm start
```

لعمل تسجيل دخول Discord، اضبط:

- `CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `COOKIE_SECRET`
- `WEB_ORIGIN`
- `PORTAL_PORT`

## إصلاح رابط OAuth

استخدم الرابط نفسه في Discord Developer Portal وفي `DISCORD_REDIRECT_URI`، وبشرطة واحدة فقط:

```text
https://your-netlify-site.netlify.app/auth/callback
```

لا تستخدم:

```text
https://your-netlify-site.netlify.app//auth/callback
```

بعد عودة Discord إلى Netlify، يحوّل الموقع الطلب تلقائيًا إلى `/auth/callback` في البورتال حتى يتم تبادل الكود بشكل آمن. يجب أن يكون `portalUrl` داخل `website/js/config.js` هو الرابط العام للبورتال، وليس رابط Netlify.

بعد تشغيل النسخة الجديدة، سجّل الخروج من الموقع ثم سجّل الدخول مرة أخرى حتى تظهر بيانات Discord الجديدة.