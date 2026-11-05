let { Router } = require('express');
let router = Router();
let bcrypt = require('bcrypt');
let jwt = require('jsonwebtoken');
let fs = require('fs');
let User = require("../../models/user.model");

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     description: Login an existing user.
 *     tags: [Authentication]
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: email
 *         description: The user's email.
 *         type: string
 *       - name: password
 *         description: The user's password.
 *         type: string
 *     responses:
 *       200:
 *         description: Returns the users email and their auth token if the passwords match.
 */
router.post('/', async (request, response) => {
  let { body } = request;

  let privateKey = fs.readFileSync('certs/privateKey.pem', {
    encoding: 'utf-8',
  });

  const found = await User.findOne({ phoneNumber: body.phoneNumber });

  if (!found)
    return response
      .status(500)
      .json({ message: 'User not found, please register them.' });
  else {
    let data = found.toJSON();

    if (bcrypt.compareSync(body.password, data.password)) {
      let token = jwt.sign(
        {
          sub: data.id,
          phoneNumber: data.phoneNumber,
        },
        privateKey,
        { expiresIn: '1d', algorithm: 'RS256' }
      );

      return response.status(200).json({
        message: 'Successfully logged in.',
        data: {
          ...data,
          password: undefined,
          authenticationToken: token,
        },
      });
    } else
      return response.status(200).json({
        message: 'Incorrect password.',
        error: 'invalid-password',
      });
  }
});

module.exports = router;
