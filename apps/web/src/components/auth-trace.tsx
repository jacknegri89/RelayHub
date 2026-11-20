import { getLocale } from "../server/locale";
import { TracePlayer } from "./trace-player";

type AuthStep = "login" | "register" | "verify";

// Lane heights on the sign-in diagram; time runs left to right at 45°.
const YOU_Y = 36;
const RELAY_Y = 108;
const WORKSPACE_Y = 180;

// A sign-in drawn like any other event: it must cross the relay's horizon.
export async function AuthTrace({ step }: { step: AuthStep }) {
  const { t } = await getLocale();
  let incoming = t("password", "password");
  let outgoing = t("session", "sessione");
  if (step === "register") {
    incoming = t("new account", "nuovo account");
    outgoing = t("workspace", "area di lavoro");
  }
  const verifying = step === "verify";
  return (
    <TracePlayer>
      <svg
        className="auth-trace"
        viewBox="0 0 360 206"
        role="img"
        aria-label={t(
          "Your sign-in travels to RelayHub, is verified and opens your workspace.",
          "Il tuo accesso raggiunge RelayHub, viene verificato e apre l’area di lavoro.",
        )}
      >
        <line className="lane" x1="0" y1={YOU_Y} x2="360" y2={YOU_Y} />
        <line
          className="horizon"
          x1="0"
          y1={RELAY_Y - 2}
          x2="360"
          y2={RELAY_Y - 2}
        />
        <line
          className="horizon"
          x1="0"
          y1={RELAY_Y + 2}
          x2="360"
          y2={RELAY_Y + 2}
        />
        <line
          className="lane"
          x1="0"
          y1={WORKSPACE_Y}
          x2="360"
          y2={WORKSPACE_Y}
        />
        <text x="0" y={YOU_Y - 10}>
          {t("YOU", "TU")}
        </text>
        <text x="0" y={RELAY_Y - 10}>
          RELAYHUB
        </text>
        <text x="0" y={WORKSPACE_Y + 20}>
          {t("WORKSPACE", "AREA DI LAVORO")}
        </text>

        <path
          data-path="incoming"
          data-segment
          data-step="1"
          data-from={"96," + YOU_Y}
          data-to={"168," + RELAY_Y}
          pathLength={1}
          strokeDasharray="1"
          d={"M96 " + YOU_Y + " L168 " + RELAY_Y}
        />
        <text x="104" y={YOU_Y - 10} data-step="1">
          {incoming}
        </text>
        <g data-step="2">
          <circle className="seal" cx="168" cy={RELAY_Y} r="9" />
          <text className="seal-label" x="164.5" y={RELAY_Y + 3}>
            ✓
          </text>
        </g>
        {!verifying && (
          <>
            <path
              data-path="outgoing"
              data-segment
              data-step="3"
              data-from={"168," + RELAY_Y}
              data-to={"240," + WORKSPACE_Y}
              pathLength={1}
              strokeDasharray="1"
              d={"M168 " + RELAY_Y + " L240 " + WORKSPACE_Y}
            />
            <g data-step="4">
              <circle className="seal" cx="240" cy={WORKSPACE_Y} r="6" />
              <text x="252" y={WORKSPACE_Y - 8}>
                {outgoing}
              </text>
            </g>
          </>
        )}
        {verifying && (
          <>
            <path
              data-path="incoming"
              data-segment
              data-step="3"
              data-from={"212," + YOU_Y}
              data-to={"284," + RELAY_Y}
              pathLength={1}
              strokeDasharray="1"
              d={"M212 " + YOU_Y + " L284 " + RELAY_Y}
            />
            <text x="220" y={YOU_Y - 10} data-step="3">
              {t("6-digit code", "codice a 6 cifre")}
            </text>
            <g data-step="4">
              <circle className="seal-pending" cx="284" cy={RELAY_Y} r="10" />
              <text
                className="seal-label seal-label-pending"
                x="281"
                y={RELAY_Y + 3.5}
              >
                ?
              </text>
            </g>
          </>
        )}
        <circle className="photon-head" cx="0" cy="0" r="3" />
      </svg>
    </TracePlayer>
  );
}
