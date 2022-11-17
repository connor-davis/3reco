let Strategy = require('passport-jwt').Strategy,
  ExtractJwt = require('passport-jwt').ExtractJwt;
let fs = require('fs');
let User = require("../models/user.model");

let pubKey = fs.readFileSync('certs/publicKey.pem', {
  encoding: 'utf8',
});

let options = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: pubKey,
  algorithms: ['RS256'],
};

module.exports = new Strategy(options, async (payload, done) => {
  const found = await User.findOne({ email: payload.email });
  
  if (!found) return done("Unauthorized", null);
  else return done(null, found.toJSON());
});
