import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { accountEmailConfigured } from "@relayhub/shared/mail";
import { getLocale } from "../../../server/locale";
import { auth } from "../../../server/auth";
import { profileEditToken } from "../../../server/form-proof";
import { avatarIds, profileAvatar } from "../../../profile-avatars";
import { PersonalWorkspace } from "../../../components/personal-workspace";
import { ProfileAvatar } from "../../../components/profile-avatar";
import { ActionForm } from "../../../components/forms";
import styles from "../../../components/personal-workspace.module.css";

const avatarLabels = {
  initials: ["Initials", "Iniziali"],
  signal: ["Signal", "Segnale"],
  orbit: ["Orbit", "Orbita"],
  routes: ["Routes", "Percorsi"],
} as const;

export async function generateMetadata() {
  const { t } = await getLocale();
  return { title: t("Your profile", "Il tuo profilo") };
}

export default async function ProfilePage() {
  const { t } = await getLocale();
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }
  const user = session.user;
  const selected = profileAvatar(user.image);
  // Leave a previously stored image in place until the member chooses a replacement.
  const hasOtherImage = Boolean(user.image && selected === "initials");
  return (
    <PersonalWorkspace
      current="profile"
      title={t("Your profile", "Il tuo profilo")}
      guideTitle={t("How your team sees you", "Come ti vede il team")}
      guide={t(
        "Your display name appears in the member list of every organization you belong to. Your email is used to sign in.",
        "Il tuo nome compare nell’elenco dei membri delle organizzazioni di cui fai parte. Usi il tuo indirizzo email per accedere.",
      )}
    >
      <section className={styles.panel} aria-labelledby="identity-title">
        <header className={styles.identity}>
          <ProfileAvatar name={user.name} avatar={selected} />
          <h2 id="identity-title">{user.name}</h2>
        </header>
        <ActionForm
          endpoint="/api/profile"
          label={t("Save profile", "Salva profilo")}
          successMessage="profile_saved"
          className={styles.editor}
        >
          <input
            type="hidden"
            name="csrfToken"
            value={profileEditToken(session.session.id).toString("hex")}
          />
          <label>
            {t("Display name", "Nome visualizzato")}
            <input
              name="name"
              autoComplete="name"
              required
              maxLength={80}
              defaultValue={user.name}
              placeholder={t("e.g. Alex Rossi", "Es. Giulia Rossi")}
            />
          </label>
          <fieldset className={styles.appearances}>
            <legend>{t("Profile avatar", "Avatar del profilo")}</legend>
            <div>
              {avatarIds.map((id) => (
                <label key={id}>
                  <input
                    type="radio"
                    name="avatar"
                    value={id}
                    defaultChecked={!hasOtherImage && id === selected}
                  />
                  <ProfileAvatar name={user.name} avatar={id} small />
                  <span>{t(avatarLabels[id][0], avatarLabels[id][1])}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </ActionForm>
      </section>
      <section className={styles.panel} aria-labelledby="account-email">
        <div className={styles.panelBody}>
          <h2 id="account-email">{t("Sign-in email", "Email di accesso")}</h2>
          <div className={styles.emailRow}>
            <span>{user.email}</span>
            {user.emailVerified && (
              <strong>{t("Verified address", "Indirizzo verificato")}</strong>
            )}
          </div>
          {accountEmailConfigured() && !user.emailVerified && (
            <>
              <p>
                {t(
                  "Verify this address to recover your password by email.",
                  "Verifica questo indirizzo per poter recuperare la password via email.",
                )}
              </p>
              <ActionForm
                endpoint="/api/account-email/request-verification"
                label={t("Send verification link", "Invia link di verifica")}
                successMessage="verification_requested"
              />
            </>
          )}
        </div>
      </section>
    </PersonalWorkspace>
  );
}
