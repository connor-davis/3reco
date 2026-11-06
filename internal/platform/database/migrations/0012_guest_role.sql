-- Everyone without a role is a guest until they finish setup.
UPDATE users SET role = 'guest' WHERE role IS NULL OR role = '';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
	CHECK (role IN ('guest', 'admin', 'staff', 'business', 'collector'));

ALTER TABLE users ALTER COLUMN role SET DEFAULT 'guest';
ALTER TABLE users ALTER COLUMN role SET NOT NULL;
