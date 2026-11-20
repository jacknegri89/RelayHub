-- Serialize native Better Auth reset-token issuance for each account. The last
-- request replaces earlier links even if two application instances issue them together.
CREATE FUNCTION replace_account_reset_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM "User" WHERE id = NEW.value FOR UPDATE;
  DELETE FROM "Verification" WHERE value = NEW.value AND identifier LIKE 'relayhub-reset:%';
  RETURN NEW;
END;
$$;

CREATE TRIGGER replace_account_reset_link
BEFORE INSERT ON "Verification"
FOR EACH ROW WHEN (NEW.identifier LIKE 'relayhub-reset:%')
EXECUTE FUNCTION replace_account_reset_link();
