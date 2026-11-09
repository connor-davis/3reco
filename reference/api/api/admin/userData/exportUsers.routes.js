// let { Router } = require('express');
// let router = Router();
// let passport = require('passport');
// let fs = require('fs');
// let path = require('path');
// let User = require('../../../models/user.model');
// let Product = require('../../../models/product.model');
// let Produce = require('../../../models/produce.model');
// let Harvest = require('../../../models/harvest.model');
// let Sale = require('../../../models/sale.model');
// const generateAllUsersExcelSheet = require('../../utils/excel/generateAllUsersExcelSheet');

// /**
//  * @openapi
//  * /api/v1/admin/exportUser:
//  *   get:
//  *     description: Get all data for user.
//  *     tags: [Admin]
//  *     produces:
//  *       - application/text
//  *     security:
//  *       - Bearer: []
//  *     responses:
//  *       200:
//  *         description: Returns data or error.
//  *       401:
//  *         description: Returns "Unauthorized".
//  */
// router.get(
//   '/',
//   passport.authenticate('jwt', { session: false }),
//   async (request, response) => {
//     let { user } = request;

//     if (user.businessType !== 'admin') return response.status(401);

//     try {
//       const usersData = await User.find();
//       const productsData = await Product.find();
//       const produceData = await Produce.find();
//       const harvestsData = await Harvest.find();
//       const salesData = await Sale.find();

//       generateAllUsersExcelSheet(
//         usersData,
//         productsData,
//         produceData,
//         harvestsData,
//         salesData,
//         (path) => {
//           response.set(
//             'Content-disposition',
//             'attachment; filename=purpose-users-data.xlsx'
//           );
//           response.set(
//             'Content-type',
//             'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64'
//           );
//           response.status(200).download(path);

//           setTimeout(() => {
//             fs.unlinkSync(path);
//           }, 30000);
//         }
//       );
//     } catch (error) {
//       return response
//         .status(200)
//         .json({ message: 'Unable to generate excel data.', error });
//     }
//   }
// );

// module.exports = router;
