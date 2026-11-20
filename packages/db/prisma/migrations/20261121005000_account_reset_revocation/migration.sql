-- Better Auth spends the submitted reset token, revokes sessions and updates the
-- password in one transaction. Invalidate sibling reset links and sign-in
-- challenges issued with the old password in that same transaction.
CREATE FUNCTION invalidate_prior_account_challenges() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM "Verification"
  WHERE value = NEW."userId" AND (
    identifier LIKE 'relayhub-reset:%' OR identifier LIKE '2fa-%' OR identifier LIKE 'trust-device-%'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER account_password_rotated
AFTER UPDATE OF password ON "Account"
FOR EACH ROW
WHEN (NEW."providerId" = 'credential' AND OLD.password IS DISTINCT FROM NEW.password)
EXECUTE FUNCTION invalidate_prior_account_challenges();
