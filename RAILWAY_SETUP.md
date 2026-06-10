# Railway account-system setup

The classroom login system requires a Railway PostgreSQL database and a bootstrap teacher account.

## 1. Add PostgreSQL

In the Railway project, click **New** and add **PostgreSQL**.

Railway should automatically make `DATABASE_URL` available to the NFL web service. If it does not, add a service variable referencing the PostgreSQL service's `DATABASE_URL`.

## 2. Add teacher variables

Add these variables to the NFL web service:

- `TEACHER_USERNAME`: the teacher login username, such as `teacher`
- `TEACHER_PIN`: a private 4-8 digit PIN
- `TEACHER_DISPLAY_NAME`: optional teacher display name
- `NODE_ENV`: `production`

Do not share the teacher PIN with students.

## 3. Deploy

Redeploy the NFL web service. On startup, the app creates its database tables and creates the first teacher account if it does not already exist.

Visit `/login` to sign in. Teachers are sent to `/teacher`, where they can create student usernames and PINs.

## Stored classroom data

The app stores only:

- Teacher-created username and display name
- Securely hashed PIN
- Selected NFL team
- Pages viewed and time spent
- Pages marked complete
- Last login/activity time

No student email addresses are collected.
