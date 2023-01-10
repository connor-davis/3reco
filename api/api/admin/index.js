let {Router} = require('express');
let router = Router();
let passport = require('passport');

let usersRoutes = require('./users');
let materialsRoutes = require("./materials");

router.use("/materials", materialsRoutes);
router.use("/users", usersRoutes);

router.use('/passwordReset', require('./passwordReset.routes'));
//router.use('/deleteUser', require('./deleteUser.routes'));
// router.use('/exportUser', require('./userData/exportUser.routes'));
// router.use('/exportUsers', require('./userData/exportUsers.routes'));

module.exports = router;
