let {Router} = require('express');
let router = Router();
let passport = require('passport');

let User = require('../../../models/user.model');

let UserType = require("../../../types/user.types");

/**
 * @openapi
 * /api/v1/users/count:
 *   get:
 *     description: Get all users count.
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
    '/count',
    passport.authenticate(
        'jwt',
        {session: false}
    ),
    async (request, response) => {
        let {user} = request;

        if (user.userType !== UserType.ADMIN) return response.status(401);

        try {
            if ((await User.count()) > 1) {
                const found = await User.count();

                return response.status(200).json({
                    data: found,
                });
            } else {
                return response.status(200).json({data: 0});
            }
        } catch (error) {
            return response
                .status(200)
                .json({message: 'Error while retrieving users count.', error});
        }
    }
);

/**
 * @openapi
 * /api/v1/users:
 *   get:
 *     description: Retrieve all users.
 *     tags: [Admin]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns all users.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
    '/',
    passport.authenticate('jwt', {session: false}),
    async (request, response) => {
        const foundData = await User.find();

        const data = foundData.map((user) => {
            const obj = user.toJSON();

            if (user.userType !== UserType.ADMIN) return {
                _id: obj._id.toString(),
                firstName: obj.firstName,
                lastName: obj.lastName,
                phoneNumber: obj.phoneNumber,
                userType: obj.userType
            };
        });

        if (!data)
            return response
                .status(200)
                .json({message: 'Users not found.', error: 'users-not-found'});
        else {
            return response
                .status(200)
                .json({data: Array.from(data)});
        }
    }
);

/**
 * @openapi
 * /api/v1/users/pages:
 *   get:
 *     description: Retrieve users pages.
 *     tags: [Admin]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns users pages.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
    '/pages',
    passport.authenticate('jwt', {session: false}),
    async (request, response) => {
        let {limit} = request.query;
        if (!limit) limit = 10;

        const found = await User.find();

        if (!found) return response.status(200).json({pages: 0});
        else {
            let pageList = [];

            let result = await User.find()
                .skip(pageList.length * limit)
                .limit(limit);

            result = result.filter((user) => user.userType !== UserType.ADMIN)

            while (result.length > 0) {
                pageList.push([
                    ...result.map((item) => {
                        return item;
                    }),
                ]);

                result = await User.find()
                    .skip(pageList.length * limit)
                    .limit(limit);

                result = result.filter((user) => user.userType !== UserType.ADMIN)
            }

            let pages = pageList.length;

            return response.status(200).json({pages});
        }
    }
);

/**
 * @openapi
 * /api/v1/users/page/:page:
 *   get:
 *     description: Retrieve users page by page number.
 *     tags: [Admin]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns users for page.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
    '/page/:page',
    passport.authenticate('jwt', {session: false}),
    async (request, response) => {
        const {page} = request.params;
        let {limit} = request.query;
        if (!limit) limit = 10;

        let found = await User.find()
            .skip((page - 1) * limit > 0 ? (page - 1) * limit : 0)
            .limit(limit);

        found = found.filter((user) => user.userType !== UserType.ADMIN);

        if (!found) return response.status(200).json({pageData: []});
        else
            return response.status(200).json({
                pageData: found.map((item) => {
                    return item;
                }),
            });
    }
);

/**
 * @openapi
 * /api/v1/users/:id:
 *   get:
 *     description: Retrieve user item.
 *     tags: [Admin]
 *     produces:
 *       - application/json
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Returns user item.
 *       401:
 *         description: Returns "Unauthorized".
 */
router.get(
    '/:id',
    passport.authenticate('jwt', {session: false}),
    async (request, response) => {
        const {id} = request.params;

        const found = await User.findOne({_id: id});

        if (!found && found.userType !== UserType.ADMIN)
            return response.status(200).json({
                message: 'User item not found.',
                error: 'user-item-not-found',
            });
        else {
            return response.status(200).json({data: {...found.toJSON()}});
        }
    }
);

module.exports = router;