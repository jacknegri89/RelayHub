import { createHash, randomBytes } from "node:crypto";
import { open, readFile, rename, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { parseArgs, parseEnv } from "node:util";

const SCOPE = "https://www.googleapis.com/auth/gmail.send";
const ENV_FILE = resolve(".env");
const TOKEN_KEY = "GMAIL_REFRESH_TOKEN";
const SETUP_KEYS = [
  "GMAIL_CLIENT_ID",
  "GMAIL_CLIENT_SECRET",
  "RELAYHUB_EMAIL_FROM",
];
const CONSENT_TIMEOUT_MS = 10 * 60_000;
const EXCHANGE_TIMEOUT_MS = 10_000;

function options() {
  try {
    return parseArgs({
      options: {
        "client-json": { type: "string" },
        sender: { type: "string" },
        help: { type: "boolean" },
      },
    }).values;
  } catch {
    throw new Error(
      "Argomenti non validi. Esegui pnpm gmail:authorize --help.",
    );
  }
}

async function importClient(path, sender) {
  let client;
  try {
    const document = JSON.parse(await readFile(path, "utf8"));
    client = document.installed;
  } catch {
    throw new Error(
      "Impossibile leggere il file JSON del client Desktop indicato.",
    );
  }
  // Import only the two credential fields from a Desktop client, never URLs from the JSON.
  if (
    typeof client?.client_id !== "string" ||
    !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(client.client_id) ||
    typeof client?.client_secret !== "string" ||
    !/^[\w.-]+$/.test(client.client_secret)
  ) {
    throw new Error(
      "Il file indicato deve contenere un client OAuth di tipo Desktop app.",
    );
  }
  return {
    GMAIL_CLIENT_ID: client.client_id,
    GMAIL_CLIENT_SECRET: client.client_secret,
    RELAYHUB_EMAIL_FROM: sender,
  };
}

function checkSetup(config) {
  if (SETUP_KEYS.some((key) => !config[key]?.trim())) {
    throw new Error(
      "Compila GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET e RELAYHUB_EMAIL_FROM nel file .env locale.",
    );
  }
  // A personal sender looks like nome.cognome@gmail.com.
  if (!/^[\w.+-]+@gmail\.com$/i.test(config.RELAYHUB_EMAIL_FROM)) {
    throw new Error(
      "RELAYHUB_EMAIL_FROM deve contenere il tuo indirizzo Gmail.",
    );
  }
}

function authorizationUrl(config, redirectUri, state, verifier) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.GMAIL_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    login_hint: config.RELAYHUB_EMAIL_FROM,
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  return url;
}

function reply(response, status, text) {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
  });
  response.end(text);
}

async function receiveCode(config, verifier) {
  const state = randomBytes(32).toString("base64url");
  const server = createServer();
  let timer;
  try {
    return await new Promise((accept, reject) => {
      server.once("error", () =>
        reject(new Error("Non è stato possibile aprire il callback locale.")),
      );
      server.listen(0, "127.0.0.1", () => {
        const origin = "http://127.0.0.1:" + server.address().port;
        const callback = new URL("/oauth2/callback", origin);
        server.on("request", (request, response) => {
          const url = URL.parse(request.url, origin);
          if (
            request.method !== "GET" ||
            request.headers.host !== callback.host ||
            url?.origin !== origin ||
            url.pathname !== callback.pathname
          ) {
            reply(response, 404, "Percorso sconosciuto.");
            return;
          }
          if (url.searchParams.get("state") !== state) {
            reply(
              response,
              400,
              "Risposta non valida. Riapri il link mostrato nel terminale.",
            );
            return;
          }
          const code = url.searchParams.get("code");
          if (url.searchParams.has("error") || !code) {
            reply(
              response,
              400,
              "Autorizzazione non completata. Puoi chiudere la pagina.",
            );
            reject(
              new Error(
                "Google non ha concesso l’autorizzazione. Il token locale è invariato.",
              ),
            );
            return;
          }
          reply(
            response,
            200,
            "Risposta ricevuta. Torna al terminale per verificare il salvataggio.",
          );
          accept({ code, redirectUri: callback.href });
        });
        console.log(
          "Apri questo link nel browser di questo computer e scegli il mittente configurato in RelayHub:\n" +
            authorizationUrl(config, callback.href, state, verifier).href,
        );
      });
      timer = setTimeout(
        () =>
          reject(
            new Error("Autorizzazione scaduta. Esegui di nuovo il comando."),
          ),
        CONSENT_TIMEOUT_MS,
      );
    });
  } finally {
    clearTimeout(timer);
    server.close();
    server.closeAllConnections();
  }
}

async function exchange(config, authorization, verifier) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
    redirect: "error",
    body: new URLSearchParams({
      client_id: config.GMAIL_CLIENT_ID,
      client_secret: config.GMAIL_CLIENT_SECRET,
      grant_type: "authorization_code",
      code: authorization.code,
      redirect_uri: authorization.redirectUri,
      code_verifier: verifier,
    }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      "Google ha rifiutato lo scambio del codice (HTTP " +
        response.status +
        ").",
    );
  }
  const result = await response.json().catch(() => null);
  // Insert only a single .env-safe token. Require confirmation of the single requested scope.
  if (
    result?.scope !== SCOPE ||
    typeof result.refresh_token !== "string" ||
    !/^[A-Za-z0-9._~\/+-]{1,4096}$/.test(result.refresh_token)
  ) {
    throw new Error(
      "Google non ha restituito un refresh token con il solo permesso gmail.send.",
    );
  }
  return result.refresh_token;
}

function updatedEnvironment(original, current, changes) {
  let separator = "\n";
  if (original.includes("\r\n")) {
    separator = "\r\n";
  }
  // Replace a conventional single-line assignment, preserving unrelated settings and comments.
  const assignment =
    /^[ \t]*(?:export[ \t]+)?(GMAIL_CLIENT_ID|GMAIL_CLIENT_SECRET|RELAYHUB_EMAIL_FROM|GMAIL_REFRESH_TOKEN)[ \t]*=[^\r\n]*/gm;
  let updated = original.replace(assignment, (line, key) => {
    if (Object.hasOwn(changes, key)) {
      return key + "=" + changes[key];
    }
    return line;
  });
  for (const [key, value] of Object.entries(changes)) {
    if (!Object.hasOwn(current, key)) {
      if (!updated.endsWith("\n")) {
        updated += separator;
      }
      updated += key + "=" + value + separator;
    }
  }
  const verified = parseEnv(updated);
  const expected = { ...current, ...changes };
  if (
    Object.keys(verified).length !== Object.keys(expected).length ||
    Object.entries(expected).some(([key, value]) => verified[key] !== value)
  ) {
    throw new Error(
      "Il file .env contiene un’assegnazione non supportata. Usa una sola riga per ciascun valore Gmail.",
    );
  }
  return updated;
}

async function saveSettings(initial, changes) {
  const original = await readFile(ENV_FILE, "utf8");
  const current = parseEnv(original);
  if ([...SETUP_KEYS, TOKEN_KEY].some((key) => current[key] !== initial[key])) {
    throw new Error(
      "La configurazione Gmail è cambiata durante il consenso. Ripeti l’autorizzazione.",
    );
  }
  const updated = updatedEnvironment(original, current, changes);
  const temporary = ENV_FILE + "." + randomBytes(12).toString("hex") + ".tmp";
  const file = await open(temporary, "wx", 0o600);
  try {
    try {
      await file.writeFile(updated, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    if ((await readFile(ENV_FILE, "utf8")) !== original) {
      throw new Error("Il file .env è cambiato. Ripeti l’autorizzazione.");
    }
    await rename(temporary, ENV_FILE);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function authorize() {
  const flags = options();
  if (flags.help) {
    console.log(
      'pnpm gmail:authorize\npnpm gmail:authorize --client-json "percorso/client.json" --sender "nome@gmail.com"',
    );
    return;
  }
  if (flags.sender && !flags["client-json"]) {
    throw new Error(
      "Usa --sender insieme a --client-json oppure imposta RELAYHUB_EMAIL_FROM in .env.",
    );
  }
  const initial = parseEnv(await readFile(ENV_FILE, "utf8"));
  let changes = {};
  if (flags["client-json"]) {
    changes = await importClient(
      flags["client-json"],
      flags.sender ?? initial.RELAYHUB_EMAIL_FROM,
    );
  }
  const config = { ...initial, ...changes };
  checkSetup(config);
  const verifier = randomBytes(64).toString("base64url");
  const authorization = await receiveCode(config, verifier);
  const token = await exchange(config, authorization, verifier);
  await saveSettings(initial, { ...changes, [TOKEN_KEY]: token });
  console.log(
    "Refresh token salvato in .env. Per attivare il recupero password, configura sul servizio web le credenziali Gmail e il mittente, imposta RELAYHUB_MAIL_PROVIDER=gmail e RELAYHUB_ACCOUNT_EMAIL=1, poi riavvia o ridistribuisci il servizio.",
  );
}

authorize().catch((error) => {
  if (error.code === "ENOENT") {
    console.error(
      "File .env mancante. Esegui pnpm setup nella radice del progetto.",
    );
  } else if (
    error instanceof SyntaxError ||
    error instanceof TypeError ||
    error.code
  ) {
    console.error(
      "Autorizzazione non completata. Controlla il file .env, la connessione e i permessi di scrittura.",
    );
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
});
