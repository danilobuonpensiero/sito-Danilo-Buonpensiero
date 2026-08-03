require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});

const ALLOWED_LANGS = ['it', 'en', 'es'];

function plainText(richTextArray) {
  return (richTextArray || []).map((t) => t.plain_text).join('');
}

function pickWithItalianFallback(italian, translated) {
  return translated && translated.trim() ? translated : italian;
}

function notionPageToPortfolioItem(page, lang) {
  const props = page.properties || {};

  const titleIT = plainText(props['Titolo']?.title);
  const titleEN = plainText(props['Titolo EN']?.rich_text);
  const titleES = plainText(props['Titolo ES']?.rich_text);

  const descIT = plainText(props['Descrizione IT']?.rich_text);
  const descEN = plainText(props['Descrizione EN']?.rich_text);
  const descES = plainText(props['Descrizione ES']?.rich_text);

  const titleByLang = { it: titleIT, en: pickWithItalianFallback(titleIT, titleEN), es: pickWithItalianFallback(titleIT, titleES) };
  const descByLang = { it: descIT, en: pickWithItalianFallback(descIT, descEN), es: pickWithItalianFallback(descIT, descES) };

  const file = props['Copertina']?.files?.[0];
  const image = file ? (file.type === 'external' ? file.external.url : file.file.url) : null;

  const link = props['Link']?.url ?? null;
  const date = props['Data']?.date ?? null;

  return {
    title: titleByLang[lang],
    description: descByLang[lang],
    image,
    link,
    dateStart: date?.start ?? null,
    dateEnd: date?.end ?? null,
  };
}

app.get('/api/portfolio', async (req, res) => {
  const lang = ALLOWED_LANGS.includes(req.query.lang) ? req.query.lang : 'it';

  const token = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!token || !databaseId) {
    return res.status(200).json([]);
  }

  try {
    const notionRes = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: { property: 'Pubblica', checkbox: { equals: true } },
        sorts: [{ property: 'Data', direction: 'descending' }],
      }),
    });

    if (!notionRes.ok) {
      console.error('Notion API error:', notionRes.status, await notionRes.text());
      return res.status(200).json([]);
    }

    const data = await notionRes.json();
    const items = (data.results || []).map((page) => notionPageToPortfolioItem(page, lang));
    return res.status(200).json(items);
  } catch (err) {
    console.error('Failed to fetch portfolio from Notion:', err);
    return res.status(200).json([]);
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
