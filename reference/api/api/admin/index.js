const { Router } = require('express');
const router = Router();
const passport = require('passport');

const usersRoutes = require('./users');
const materialsRoutes = require('./materials');
const transactionsRoutes = require('./transactions');
const exportMaterialsRoutes = require('./materials/exportMaterials');
const exportUsersRoutes = require('./users/exportUsers');
const exportTransactionsRoutes = require('./transactions/exportTransactions');

router.use('/materials', materialsRoutes);
router.use('/users', usersRoutes);
router.use('/transactions', transactionsRoutes);
router.use('/export/materials', exportMaterialsRoutes);
router.use('/export/users', exportUsersRoutes);
router.use('/export/transactions', exportTransactionsRoutes);

router.use('/passwordReset', require('./passwordReset.routes'));
//router.use('/deleteUser', require('./deleteUser.routes'));
// router.use('/exportUser', require('./userData/exportUser.routes'));
// router.use('/exportUsers', require('./userData/exportUsers.routes'));

module.exports = router;
