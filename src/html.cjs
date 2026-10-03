// HTML parsing for CAS execution tokens, error text and redirects.
'use strict';

function decodeHtmlEntities(value) {
  return String(value).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const key = entity.toLowerCase();
    if (key === 'nbsp') return ' ';
    if (key === 'amp') return '&';
    if (key === 'lt') return '<';
    if (key === 'gt') return '>';
    if (key === 'quot') return '"';
    if (key === 'apos') return "'";
    if (key.startsWith('#x')) {
      const code = Number.parseInt(key.slice(2), 16);
      return Number.isInteger(code) ? String.fromCodePoint(code) : match;
    }
    if (key.startsWith('#')) {
      const code = Number.parseInt(key.slice(1), 10);
      return Number.isInteger(code) ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}

function extractExecution(html) {
  const patterns = [
    /<input[^>]*name=["']execution["'][^>]*value=["']([^"']*)["']/i,
    /<input[^>]*value=["']([^"']*)["'][^>]*name=["']execution["']/i,
    /name=["']execution["'][^>]*value=["']([^"']*)["']/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match && match[1] != null) return match[1];
  }
  return null;
}

function extractCasErrorMessage(html) {
  if (typeof html !== 'string' || html.length === 0) return null;

  const patterns = [
    {
      re: /<([a-zA-Z][\w:-]*)\b[^>]*\bid\s*=\s*(?:"(?:msg|errormsg)"|'(?:msg|errormsg)'|(?:msg|errormsg)(?=[\s>]))[^>]*>([\s\S]*?)<\/\1\s*>/i,
      textIndex: 2,
    },
    {
      re: /<([a-zA-Z][\w:-]*)\b[^>]*\bclass\s*=\s*(?:"[^"]*error[^"]*"|'[^']*error[^']*'|[^\s>]*error[^\s>]*)[^>]*>([\s\S]*?)<\/\1\s*>/i,
      textIndex: 2,
    },
  ];

  for (const { re, textIndex } of patterns) {
    const match = re.exec(html);
    if (!match || !match[textIndex]) continue;
    const text = decodeHtmlEntities(match[textIndex].replace(/<[^>]*>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
    if (text) return text.slice(0, 200);
  }

  return null;
}

function extractHtmlRedirect(html, sourceUrl) {
  if (!html) return null;

  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of metaTags) {
    if (!/http-equiv\s*=\s*["']?refresh/i.test(tag)) continue;
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (!content) continue;
    const urlMatch = /url\s*=\s*["']?([^"';\s>]+)/i.exec(content);
    if (!urlMatch) continue;
    try {
      return new URL(urlMatch[1].replace(/&amp;/g, '&'), sourceUrl);
    } catch {
      // Try the next redirect form.
    }
  }

  const jsPatterns = [
    /(?:window\.|self\.|document\.|top\.|parent\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i,
    /location\.replace\(\s*["']([^"']+)["']\s*\)/i,
    /location\.assign\(\s*["']([^"']+)["']\s*\)/i,
  ];
  for (const pattern of jsPatterns) {
    const match = pattern.exec(html);
    if (!match || !match[1]) continue;
    try {
      return new URL(match[1].replace(/&amp;/g, '&'), sourceUrl);
    } catch {
      // Try the next redirect form.
    }
  }

  const formAction = /<form[^>]*action\s*=\s*["']([^"']+)["']/i.exec(html)?.[1];
  if (formAction) {
    try {
      return new URL(formAction.replace(/&amp;/g, '&'), sourceUrl);
    } catch {
      // A malformed form action is ignored.
    }
  }

  return null;
}

module.exports = { extractExecution, extractCasErrorMessage, extractHtmlRedirect };