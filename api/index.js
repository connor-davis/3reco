'use strict';
const dotenv = require('dotenv');
dotenv.config();

const logger = require('./utils/logger');
const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const http = require('http').createServer(app);
const devmode = process.env.DEV_MODE === 'true';
let https;
const compression = require('compression');
const cors = require('cors');
const { json, urlencoded } = require('body-parser');
const passport = require('passport');
const JwtStrategy = require('./strategies/jwt');
const session = require('express-session');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const morgan = require('morgan');
const chalk = require('chalk');
const io = require('socket.io')(http, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});
const apiRoutes = require('./api');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const User = require('./models/user.model');
const userTypes = require('./types/user.types');

const secure_port = process.env.HTTP_SECURE_PORT || 443;
const port = process.env.HTTP_PORT || 80;

const client = mongoose.connect('mongodb://127.0.0.1:27017/threereco');

client.then(async () => {
  logger.success('Mongoose connected to MongoDB.');

  fs.readdirSync(process.cwd() + '/temp').forEach((path) =>
    fs.unlinkSync(process.cwd() + '/temp/' + path)
  );

  logger.success(`OP MODE: ${devmode ? 'DEV' : 'PROD'}`);

  const adminFound = await User.findOne({ email: 'admin@3recoapp' });

  if (!adminFound) {
    logger.warning('Admin user does not exist, creating them now.');

    const newAdmin = new User({
      firstName: '3rEco',
      lastName: 'Admin',
      phoneNumber: 'admin',
      password: bcrypt.hashSync(process.env.ROOT_PASSWORD, 2048),
      agreedToTerms: true,
      completedProfile: true,
      userType: userTypes.ADMIN,
    });

    try {
      newAdmin.save();

      logger.success('Created admin user.');
    } catch (error) {
      logger.error(error);
    }
  }

  if (!devmode) {
    https = require('https').createServer(
      {
        cert: fs.readFileSync(process.env.CERTPATH + '/fullchain.pem'),
        key: fs.readFileSync(process.env.CERTPATH + '/privkey.pem'),
      },
      app
    );
  }

  let options = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Api (v1)',
        version: '1.0.0',
      },
    },
    apis: ['./api/**/*.js'],
  };

  let openapiSpecification = swaggerJsdoc(options);

  let morganMiddleware = morgan(function (tokens, req, res) {
    return [
      chalk.hex('#10b981').bold(tokens.method(req, res) + '\t'),
      chalk.hex('#ffffff').bold(tokens.status(req, res) + '\t'),
      chalk.hex('#262626').bold(tokens.url(req, res) + '\t\t\t'),
      chalk.hex('#10b981').bold(tokens['response-time'](req, res) + ' ms'),
    ].join(' ');
  });

  app.use(morganMiddleware);
  app.use(
    cors("*")
  );
  app.use(compression());
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: false }));
  app.use(session({ secret: process.env.ROOT_PASSWORD }));
  app.use(passport.initialize());
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');
  app.use(express.static(__dirname + '/public'));

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    const found = await User.findOne({ _id: id });

    if (found) return done(null, found.toJSON());
    else return done(null, id);
  });

  passport.use('jwt', JwtStrategy);

  app.use('/api/v1', apiRoutes);
  app.use(
    '/api/v1/docs',
    swaggerUi.serve,
    swaggerUi.setup(openapiSpecification)
  );

  app.get('/', async (request, response) => {
    response.render('pages/welcome');
  });

  app.get('/visualize', async (request, response) => {
    response.render('pages/visualize');
  });

  app.get('/**', async (request, response) => {
    response.render('pages/404.ejs');
  });

  io.on('connection', (socket) => {
    // TODO
    logger.success('a user connected to socket io');

    // socket.on('announcement', (data) => {
    //   let announcement = {
    //     announcementTitle: data.data.announcementTitle,
    //     announcementBody: data.data.announcementBody,
    //     id: v4(),
    //   };

    //   writeTransaction(ADD_ANNOUNCEMENT(announcement), (error, result) => {});

    //   socket.broadcast.emit('announcement', announcement);
    // });
  });

  http.listen(port, () =>
    logger.success(`HTTP listening on http://localhost:${port}`)
  );

  if (!devmode) {
    https.listen(secure_port, () =>
      logger.success(`HTTPS listening on https://localhost:${secure_port}`)
    );
  }
});
