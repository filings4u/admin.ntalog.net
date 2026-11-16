# NTA Logistics Management Portal

This is the dedicated administration application for NTA Logistics, separate from the public `ntalog.net` website.

The administration UI uses the existing NTA Supabase authentication and `nta-admin-api` backend. Public intake and blog delivery stay on `ntalog.net`.

Security: the management portal requires authorization through the backend; no management API secrets belong in frontend files.
