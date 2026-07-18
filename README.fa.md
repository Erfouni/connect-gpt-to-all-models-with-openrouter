# اتصال GPT به همهٔ مدل‌ها با OpenRouter

[English](README.md) · [تنظیم کامل Helios](agents/helios.md) · [دستور آمادهٔ Agent](docs/chatgpt-agent-instructions.md) · [راه‌اندازی سرور](docs/remote-deployment.md) · [امنیت](SECURITY.md)

این پروژه به شما اجازه می‌دهد از ChatGPT به‌عنوان **ارکستریتور مدل‌ها** استفاده
کنید. مثلاً در همان گفتگو می‌گویید:

- «این گفتگو را با Gemini بررسی کن.»
- «از GLM یک راه‌حل دیگر بگیر.»
- «این کد را به Kimi بده.»
- «پاسخ Claude و Qwen را با هم مقایسه کن.»

ChatGPT ابزار MCP را فراخوانی می‌کند، درخواست از طریق OpenRouter به مدل انتخابی
می‌رسد و پاسخ همراه با نام واقعی `model_used` به همان گفتگو برمی‌گردد.

Aliasهای آماده شامل `gemini`، `gemini-flash`، `glm`، `kimi`، `claude`،
`deepseek` و `qwen` هستند. همچنین می‌توان slug دقیق هر مدل موجود در OpenRouter
را وارد کرد.

## اجزای پروژه

1. `server.py`: کلید OpenRouter را نگهداری می‌کند و به‌صورت پیش‌فرض فقط روی
   `127.0.0.1:3188` در دسترس است.
2. `mcp-server.mjs`: سه ابزار MCP برای فهرست مدل‌ها، اجرای یک مدل و مقایسهٔ چند
   مدل فراهم می‌کند.
3. `docs/chatgpt-agent-instructions.md`: متن آماده‌ای که در Instructions ایجنت
   یا Custom GPT قرار می‌گیرد.

کلید API هیچ‌وقت به ChatGPT یا خروجی ابزار MCP فرستاده نمی‌شود.

## راه‌اندازی سریع

```bash
git clone https://github.com/Erfouni/connect-gpt-to-all-models-with-openrouter.git
cd connect-gpt-to-all-models-with-openrouter
cp .env.example .env
npm install
```

فایل `.env` را باز کنید و کلید خودتان را وارد کنید:

```dotenv
OPENROUTER_API_KEY=
```

Gateway را اجرا کنید:

```bash
python3 server.py
```

در ترمینال دیگر تست کنید:

```bash
curl http://127.0.0.1:3188/health
npm test
```

## سه روش استفاده

### روش اول: MCP کاملاً لوکال

برای کلاینت MCP که روی همان کامپیوتر اجرا می‌شود، فایل
`examples/mcp-client-config.json` را کپی کنید و مسیر واقعی
`mcp-server.mjs` را جایگزین کنید. کلاینت، MCP را از طریق stdio اجرا می‌کند.

### روش دوم: استفاده از MCP موجود روی مک

اگر ChatGPT از قبل به یک MCP امن روی مک وصل است و ابزار HTTP request دارد، آن
ابزار می‌تواند از داخل همان مک به آدرس زیر درخواست بزند:

```text
POST http://127.0.0.1:3188/run
```

در این حالت Gateway و کلید هر دو روی مک خصوصی باقی می‌مانند. برای این کار از
بخش Bridge mode در فایل دستور Agent استفاده کنید.

### روش سوم: سرور و نسخهٔ وب ChatGPT

MCP را به Streamable HTTP تبدیل کنید:

```bash
npm run start:mcp:http
```

مسیر داخلی MCP برابر است با:

```text
http://127.0.0.1:3100/mcp
```

برای ChatGPT web باید این سرویس پشت HTTPS و احراز هویت امن قرار بگیرد. آدرسی که
در ChatGPT ثبت می‌شود شبیه این است:

```text
https://YOUR_DOMAIN/mcp
```

مسیر فایل مک مثل `/Users/name/...` قابل‌قبول نیست. داخل این ریپو هیچ دامنه یا
کلید ngrok، توکن MCP، کلید OpenRouter یا مسیر شخصی وجود ندارد؛ هر کاربر باید
Tunnel و اطلاعات ورود خودش را بسازد. قبل از انتشار سرویس، راهنمای
[راه‌اندازی Remote](docs/remote-deployment.md) را بخوانید.

## ساخت Agent در ChatGPT

1. ابتدا MCP لوکال یا Remote را متصل و تست کنید.
2. در ChatGPT یک Custom GPT بسازید.
3. App/MCP متصل‌شده را برای آن فعال کنید؛ این گزینه ممکن است به Plan و تنظیمات
   Workspace وابسته باشد.
4. متن فایل [دستور Agent](docs/chatgpt-agent-instructions.md) را در قسمت
   Instructions قرار دهید.
5. GPT را Private ذخیره و با جملهٔ «از Gemini بخواه فقط `MODEL_OK` بنویسد» تست
   کنید.
6. مطمئن شوید پاسخ، مقدار واقعی `model_used` را نشان می‌دهد.

در نسخهٔ وب می‌توان در یک چت موجود نیز با `@نام-GPT` آن را فراخوانی کرد.

### Agent آماده با نام Helios

فایل [`agents/helios.md`](agents/helios.md) تنظیم کامل یک Custom GPT با نام
**Helios** را دارد: نام، توضیح، Conversation Starterها، Instructions، قوانین
امنیتی، ابزارهای MCP موردنیاز و روش تست.

وجود این فایل به معنی نصب خودکار GPT در حساب ChatGPT نیست. هر کاربر باید Helios
را در GPT Editor بسازد یا ویرایش کند، App مربوط به MCP خودش را به آن اضافه کند
و Instructions آماده را قرار دهد. امکان Apps در GPT به Plan و مجوزهای Workspace
وابسته است.

## نکات امنیتی مهم

- فایل واقعی `.env` هرگز نباید commit شود.
- پورت `3188` را مستقیماً روی اینترنت باز نکنید.
- فقط MCP را پشت TLS و احراز هویت امن منتشر کنید.
- یک MCP عمومی با دسترسی کامل Shell یا فایل‌ها نسازید.
- فقط بخش لازم از گفتگو یا فایل‌ها را برای مدل خارجی بفرستید.
- برای OpenRouter محدودیت هزینه و نرخ درخواست تنظیم کنید.
- درخواست مقایسه برای هر مدل یک درخواست پولی جدا ایجاد می‌کند.
- هر کلیدی که قبلاً در چت، تصویر، لاگ یا Git دیده شده باید تعویض شود.

فایل [SECURITY.md](SECURITY.md) چک‌لیست کامل‌تری دارد.

## اجرای خودکار روی macOS

پس از ساخت `.env`:

```bash
chmod +x scripts/*.sh
./scripts/install-macos-launchagent.sh
```

اسکریپت مسیر و نام کاربر را روی کامپیوتر خود شخص محاسبه می‌کند و هیچ مسیر شخصی
از قبل داخل ریپو قرار نگرفته است.

## تست بدون هزینه

```bash
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
python3 -m py_compile server.py
```

این تست‌ها هیچ مدل پولی را فراخوانی نمی‌کنند.
