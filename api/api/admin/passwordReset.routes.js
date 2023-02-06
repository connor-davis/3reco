let {Router} = require('express');
let router = Router();
let fs = require('fs');
let path = require('path');
let bcrypt = require('bcrypt');
let passport = require('passport');
let User = require('../../models/user.model');
let uuid = require("uuid");
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

    console.log(request.body);

    if (!fs.existsSync(path.join(process.cwd(), 'temp', token + '-pwrs.txt')))
        return response.status(401).send('Unauthorized');

    console.log(fs.readFileSync(path.join(process.cwd(), 'temp', token + '-pwrs.txt')));

    let passwordHash = bcrypt.hashSync(newPassword, 2048);

    console.log(passwordHash);

    const pwrsData = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'temp', token + '-pwrs.txt')));

    try {
        await User.updateOne({phoneNumber: pwrsData.user.phoneNumber}, {$set:{password: passwordHash}});

        const doc = await User.findOne({ phoneNumber: pwrsData.user.phoneNumber });

        console.log(pwrsData);
        console.log(doc.toJSON());

        fs.unlinkSync(path.join(process.cwd(), 'temp', token + '-pwrs.txt'));

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

            const token = uuid.v4();

            let passwordResetData = {
                token: token,
                user: data,
            };

            fs.writeFileSync(
                path.join(process.cwd(), 'temp', token + '-pwrs.txt'),
                JSON.stringify(passwordResetData),
                {encoding: 'utf-8'}
            );

            return response.status(200).json({
                data: {
                    link: 'https://3reco.co.za/resetPassword.html?token=' + passwordResetData.token,
                },
            });
        }
    }
);

module.exports = router;
