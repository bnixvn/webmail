/**
 * Minimal sanitizer — only removes XSS vectors, preserves ALL original HTML/CSS.
 * Does NOT use sanitize-html to avoid stripping attributes and inline styles.
 */
export function sanitizeEmailHtml(html: string): string {
  let out = html;

  // Remove dangerous tags and their content (but NOT <style>)
  out = out.replace(/<script[\s>][\s\S]*?<\/script>/gi, "");
  out = out.replace(/<script[\s\S]*?\/>/gi, "");
  out = out.replace(/<noscript[\s>][\s\S]*?<\/noscript>/gi, "");
  out = out.replace(/<iframe[\s>][\s\S]*?<\/iframe>/gi, "");
  out = out.replace(/<iframe[\s\S]*?\/>/gi, "");
  out = out.replace(/<object[\s>][\s\S]*?<\/object>/gi, "");
  out = out.replace(/<embed[\s\S]*?\/?>/gi, "");
  out = out.replace(/<applet[\s>][\s\S]*?<\/applet>/gi, "");
  out = out.replace(/<svg[\s>][\s\S]*?<\/svg>/gi, "");
  out = out.replace(/<math[\s>][\s\S]*?<\/math>/gi, "");

  // Scope <style> content inside .email-html to prevent CSS leaking to host page
  out = out.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_match, css: string) => {
    // Remove dangerous CSS properties
    let safe = css
      .replace(/expression\s*\([^)]*\)/gi, "")
      .replace(/behavior\s*:/gi, "")
      .replace(/-moz-binding\s*:/gi, "")
      .replace(/url\s*\(\s*["']?\s*javascript:/gi, "url(about:blank)");

    // Scope all selectors under .email-html
    // Split by { to separate selectors from declarations
    safe = safe.replace(/([^{}]+)\{/g, (selectors: string) => {
      const scoped = selectors
        .split(",")
        .map((s) => {
          s = s.trim();
          if (!s) return s;
          // Skip @-rules (already scoped by their block) and keyframe percentages
          if (s.startsWith("@") || /^\d+%$/.test(s)) return s;
          return `.email-html ${s}`;
        })
        .join(", ");
      return `${scoped} {`;
    });

    return `<style>${safe}</style>`;
  });

  // Remove event handler attributes (onclick, onerror, onload, onmouseover, etc.)
  out = out.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // Remove javascript: URLs in href/src/action attributes
  out = out.replace(/\b(href|src|action)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, '$1="#"');

  // Fix links to open in new tab
  out = out.replace(/<a\s/gi, '<a rel="noreferrer noopener" target="_blank" ');

  return out;
}
