Welcome to FantaF1, a Web Programming project.
To install the project, you need to have installed:

- NodeJS 18.0 or higher
- npm 6.14.0 or higher
- MySQL 8.0 or higher

To install the project, you need to run the following commands:

```bash
npm install && npm run build
```

This command will install all the dependencies and build the project, creating the build folder. It's also creating the database and the tables needed for the project.

In db.js you can find the database configuration, you can change the configuration to match your database's one. You have to create a db called "ff1" and a user called "admin" with password "admin" and grant all privileges on the database to the user. It's best to create a new user with a password of your choice and change the configuration in db.js matching the new user's credentials.

Enjoy!