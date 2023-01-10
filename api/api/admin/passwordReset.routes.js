let {Router} = require('express');
let router = Router();
let fs = require('fs');
let path = require('path');
let bcrypt = require('bcrypt');
let passport = require('passport');
let User = require('../../models/user.model');
let crypto = require('crypto-js');
let UserType = require("../../types/user.types");

/**
 * @openapi
 * /api/v1/admin/passwordReset/:
 *   post:
 *     description: Reset a users password in the database.
 *     tags: [Users]
 *     produces:
 *       - application/text
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns "Authorized".
 *       401:
 *         description: Returns "Unauthorized".
 */
router.post('/', async (request, response) => {
    let {newPassword, token} = request.body;

    let hash = '#';
    let regex = new RegExp(hash, 'g');

    token = token.replace(regex, '/');

    let decryptTokenBytes = crypto.AES.decrypt(
        token,
        fs.readFileSync(path.join(process.cwd(), 'certs', 'privateKey.pem'), {
            encoding: 'utf-8',
        })
    );
    let phoneNumber = decryptTokenBytes.toString(crypto.enc.Utf8);

    if (!fs.existsSync(path.join(process.cwd(), 'temp', phoneNumber + '-pwrs.txt')))
        return response.status(401).send('Unauthorized');

    let password = bcrypt.hashSync(newPassword, 2048);

    try {
        await User.updateOne({phoneNumber: phoneNumber}, {password});

        fs.unlinkSync(path.join(process.cwd(), 'temp', phoneNumber + '-pwrs.txt'));

        return response
            .status(200)
            .json({success: 'Reset password successfully.'});
    } catch (error) {
        return response
            .status(200)
            .json({error, message: 'Failed to reset password.'});
    }
});

/**
 * @openapi
 * /api/v1/admin/passwordReset/:id:
 *   get:
 *     description: Get all users.
 *     tags: [Admin]
 *     produces:
 *       - application/text
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns "Authorized".
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
    '/:id',
    passport.authenticate('jwt', {session: false}),
    async (request, response) => {
        let {user} = request;
        let {id} = request.params;

        console.log(user);

        if (user.userType !== UserType.ADMIN) return response.status(401);

        const found = await User.findOne({_id: id});

        if (!found)
            return response
                .status(200)
                .json({message: 'User not found', error: 'user-not-found'});
        else {
            const data = found.toJSON();

            if (!fs.existsSync(path.join(process.cwd(), 'temp')))
                fs.mkdirSync(path.join(process.cwd(), 'temp'));

            let tokenGen = crypto.AES.encrypt(
                data.phoneNumber,
                fs.readFileSync(path.join(process.cwd(), 'certs', 'privateKey.pem'), {
                    encoding: 'utf-8',
                })
            ).toString();

            let slash = '/';
            let regex = new RegExp(slash, 'g');

            tokenGen = tokenGen.replace(regex, '#');

            let passwordResetData = {
                token: tokenGen,
                user: data,
            };

            fs.writeFileSync(
                path.join(process.cwd(), 'temp', data.phoneNumber + '-pwrs.txt'),
                JSON.stringify(passwordResetData),
                {encoding: 'utf-8'}
            );

            return response.status(200).json({
                data: {
                    link: 'https://3reco.co.za/resetPassword?token=' + passwordResetData.token,
                },
            });
        }
    }
);

module.exports = router;
