type MailAction = { label: string; url: string };
type MailDetail = { label: string; value: string };

type MailContent = {
  locale: "it" | "en";
  kind: "account" | "code" | "outage" | "recovery";
  section: string;
  title: string;
  description: string;
  preview: string;
  footer: string;
  action?: MailAction;
  details?: MailDetail[];
  code?: MailDetail;
  expiry?: string;
};

const appearance = {
  account: { accent: "#58a6ff", wash: "#152335", ink: "#9fcaff" },
  code: { accent: "#58a6ff", wash: "#152335", ink: "#9fcaff" },
  outage: { accent: "#f85149", wash: "#2d1c20", ink: "#ffaaa4" },
  recovery: { accent: "#3fb950", wash: "#192921", ink: "#8cdaa0" },
};
const mono = "Consolas,'Courier New',monospace";
const table = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Draw the site's light cone with table cells so the mark survives image blocking.
function brandMark() {
  const rows = [26, 22, 18, 14, 10, 6, 2, 6, 10, 14, 18, 22, 26];
  const strips = rows.map((width, index) => {
    let paint = "background-color:#e6e8eb;";
    if (index === 6) {
      paint = "background-color:#58a6ff;";
    } else if (index > 6 && index < rows.length - 1) {
      paint = "border-left:2px solid #9aa3ad;border-right:2px solid #9aa3ad;";
    } else if (index === rows.length - 1) {
      paint = "background-color:#9aa3ad;";
    }
    return `<tr><td align="center"><table ${table} width="${width}" style="width:${width}px;"><tr><td height="2" style="height:2px;font-size:0;line-height:2px;mso-line-height-rule:exactly;${paint}">&nbsp;</td></tr></table></td></tr>`;
  });
  return `<table ${table} aria-hidden="true" width="26">${strips.join("")}</table>`;
}

function actionButton(action: MailAction) {
  const protocol = new URL(action.url).protocol;
  if (protocol !== "https:" && protocol !== "http:") {
    throw new Error("Invalid RelayHub email link");
  }
  return `<table ${table} style="margin-top:24px;"><tr><td bgcolor="#58a6ff" style="border-radius:6px;mso-padding-alt:13px 20px;">
    <a href="${escapeHtml(action.url)}" style="display:inline-block;padding:13px 20px;color:#0b0d10;background-color:#58a6ff;border-radius:6px;font-size:15px;font-weight:700;line-height:22px;text-decoration:none;mso-padding-alt:0;">${escapeHtml(action.label)}</a>
  </td></tr></table>`;
}

function detailPanel(mail: MailContent) {
  const colors = appearance[mail.kind];
  const fields = [];
  for (const detail of mail.details ?? []) {
    fields.push(`<tr><td style="padding:7px 0;word-wrap:break-word;overflow-wrap:anywhere;word-break:break-word;">
      <p style="margin:0 0 3px;color:${colors.ink};font:12px/18px ${mono};">${escapeHtml(detail.label)}</p>
      <p dir="auto" style="margin:0;color:#e6e8eb;font-size:16px;line-height:23px;font-weight:bold;">${escapeHtml(detail.value)}</p>
    </td></tr>`);
  }
  if (mail.code) {
    fields.push(`<tr><td style="padding:8px 0;">
      <p style="margin:0 0 6px;color:${colors.ink};font:12px/18px ${mono};">${escapeHtml(mail.code.label)}</p>
      <p dir="ltr" style="margin:0;color:#e6e8eb;font:bold 29px/36px ${mono};letter-spacing:3px;">${escapeHtml(mail.code.value)}</p>
    </td></tr>`);
  }
  if (fields.length === 0) {
    return "";
  }
  return `<table ${table} width="100%" style="width:100%;table-layout:fixed;margin-top:22px;"><tr>
    <td bgcolor="${colors.wash}" style="border-left:3px solid ${colors.accent};padding:8px 16px;"><table ${table} width="100%" style="width:100%;table-layout:fixed;">${fields.join("")}</table></td>
  </tr></table>`;
}

export function renderMail(mail: MailContent) {
  const colors = appearance[mail.kind];
  let button = "";
  let expiry = "";
  if (mail.action) {
    button = actionButton(mail.action);
  }
  if (mail.expiry) {
    expiry = `<p style="margin:14px 0 0;color:#aeb8c3;font-size:13px;line-height:20px;">${escapeHtml(mail.expiry)}</p>`;
  }
  return `<!doctype html>
<html lang="${mail.locale}"><head><meta charset="utf-8"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(mail.title)}</title>
<style>:root{color-scheme:dark;supported-color-schemes:dark}@media only screen and (max-width:480px){.rh-page{padding:12px 6px!important}.rh-inset{padding-left:20px!important;padding-right:20px!important}.rh-title{font-size:29px!important;line-height:34px!important}}</style></head>
<body style="margin:0;padding:0;background-color:#0b0d10;color:#e6e8eb;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none!important;visibility:hidden;mso-hide:all;max-height:0;max-width:0;overflow:hidden;opacity:0;">${escapeHtml(mail.preview)}</div>
<table ${table} width="100%" bgcolor="#0b0d10" style="width:100%;"><tr><td align="center" class="rh-page" style="padding:36px 10px;">
<!--[if mso]><table role="presentation" width="560" align="center"><tr><td><![endif]-->
<table ${table} width="100%" align="center" bgcolor="#171b21" style="width:100%;max-width:560px;table-layout:fixed;border:1px solid #363d47;border-radius:10px;border-spacing:0;text-align:left;">
<tr><td class="rh-inset" bgcolor="#111418" style="border-radius:9px 9px 0 0;border-bottom:3px solid ${colors.accent};padding:20px 32px;">
  <table ${table} width="100%"><tr><td width="34">${brandMark()}</td>
  <td style="color:#f0f2f5;font-size:20px;font-weight:700;letter-spacing:-1px;">RelayHub</td>
  <td align="right" style="padding-left:6px;color:#c0ccd8;font:12px/17px ${mono};">${escapeHtml(mail.section)}</td></tr></table>
</td></tr>
<tr><td class="rh-inset" bgcolor="#171b21" style="background-color:#171b21;padding:30px 32px;">
  <h1 class="rh-title" style="margin:0 0 12px;color:#f0f2f5;font:bold 35px/40px Arial,Helvetica,sans-serif;letter-spacing:-1.2px;">${escapeHtml(mail.title)}</h1>
  <p style="margin:0;color:#cad1d9;font-size:16px;line-height:25px;">${escapeHtml(mail.description)}</p>
  ${detailPanel(mail)}${button}${expiry}
</td></tr>
<tr><td class="rh-inset" bgcolor="#111418" style="border-top:1px solid #363d47;border-radius:0 0 9px 9px;padding:17px 32px;color:#aeb8c3;font-size:13px;line-height:20px;">${escapeHtml(mail.footer)}</td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}
