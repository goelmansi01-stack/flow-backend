-- PostgreSQL 15+ revokes CREATE on public schema from PUBLIC by default.
-- Grant to both the specific user and the PUBLIC role so Prisma can
-- run its internal schema-inspection queries correctly.
GRANT ALL ON SCHEMA public TO flow_user;
GRANT ALL ON SCHEMA public TO PUBLIC;
