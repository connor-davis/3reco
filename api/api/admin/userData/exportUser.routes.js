// let { Router } = require('express');
// let router = Router();
// let passport = require('passport');
// let fs = require('fs');
// let path = require('path');
// let User = require('../../../models/user.model');
// const {
//   generateEcdUserExcelSheet,
//   generateStandardUserExcelSheet,
// } = require('../../utils/excel/generateUserExcelSheet');

// /**
//  * @openapi
//  * /api/v1/admin/exportUser/:id:
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
//   '/:id',
//   passport.authenticate('jwt', { session: false }),
//   async (request, response) => {
//     let { user } = request;
//     let { id } = request.params;

//     if (user.businessType !== 'admin') return response.status(401);

//     try {
//       const userFound = await User.findOne({ _id: id });

//       if (userFound) {
//         const userData = userFound.toJSON();

//         if (userData.businessType === 'earlyChildhoodDevelopmentCenter') {
//           const produceFound = await Produce.find({ owner: userData._id });
//           const produceData = produceFound.map((produce) => {
//             return { ...produce.toJSON() };
//           });
//           const harvestsFound = await Harvest.find({ owner: userData._id });
//           const harvestsData = harvestsFound.map((harvest) => {
//             return { ...harvest.toJSON() };
//           });
//           const salesFound = await Sale.find({ owner: userData._id });
//           const salesData = salesFound.map((sale) => {
//             return { ...sale.toJSON() };
//           });

//           await generateEcdUserExcelSheet(
//             user,
//             produceData,
//             harvestsData,
//             salesData,
//             (path) => {
//               response.set(
//                 'Content-disposition',
//                 'attachment; filename=' + user.email + '-data.xlsx'
//               );
//               response.set(
//                 'Content-type',
//                 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64'
//               );
//               response.status(200).download(path);

//               setTimeout(() => {
//                 fs.unlinkSync(path);
//               }, 30000);
//             }
//           );
//         } else {
//           const productsFound = await Product.find({ owner: userData._id });
//           const productsData = productsFound.map((product) => {
//             return { ...product.toJSON() };
//           });
//           const salesFound = await Sale.find({ owner: userData._id });
//           const salesData = salesFound.map((sale) => {
//             return { ...sale.toJSON() };
//           });

//           console.log(userData);

//           await generateStandardUserExcelSheet(
//             userData,
//             productsData,
//             salesData,
//             (path) => {
//               response.set(
//                 'Content-disposition',
//                 'attachment; filename=' + user.email + '-data.xlsx'
//               );
//               response.set(
//                 'Content-type',
//                 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64'
//               );
//               response.status(200).download(path);

//               setTimeout(() => {
//                 fs.unlinkSync(path);
//               }, 30000);
//             }
//           );
//         }
//       } else {
//         return response
//           .status(200)
//           .json({ message: 'User not found.', error: 'user-not-found' });
//       }
//     } catch (error) {
//       return response
//         .status(200)
//         .json({ message: 'Error while retrieving user.', error });
//     }
//   }
// );

// let generateExcel = async (
//   user,
//   sales,
//   products,
//   callback = (path) => {}
// ) => {};

// let generateExcelEcd = async (
//   user,
//   sales,
//   produce,
//   harvests,
//   callback = (path) => {}
// ) => {
//   let workbook = new ExcelJS.Workbook();

//   workbook.creator = 'Purpose360';
//   workbook.lastModifiedBy = 'Purpose360 Server';
//   workbook.created = new Date();
//   workbook.modified = new Date();

//   let userProfileSheet = workbook.addWorksheet('Profile', {
//     headerFooter: { firstHeader: 'Profile' },
//   });

//   userProfileSheet.columns = [
//     { header: 'First Name', key: 'firstName' },
//     {
//       header: 'Last Name',
//       key: 'lastName',
//     },
//     { header: 'Email', key: 'email' },
//     { header: 'Business Name', key: 'displayName' },
//     {
//       header: 'Business Type',
//       key: 'type',
//     },
//     { header: 'Business Description', key: 'typeDescription' },
//     {
//       header: 'Business Registration Number',
//       key: 'registrationNumber',
//     },
//     { header: 'Bank Account Number', key: 'accountNumber' },
//     {
//       header: 'Bank Name',
//       key: 'bankName',
//     },
//     { header: 'Bank Branch Code', key: 'bankBranch' },
//     {
//       header: 'Street Address',
//       key: 'streetAddress',
//     },
//     { header: 'Suburb', key: 'suburb' },
//     { header: 'Ward', key: 'ward' },
//     {
//       header: 'City',
//       key: 'city',
//     },
//     { header: 'Area Code', key: 'areaCode' },
//     { header: 'Province', key: 'province' },
//     {
//       header: 'Country',
//       key: 'country',
//     },
//   ];

//   userProfileSheet.addRow({
//     firstName: user.firstName || '',
//     lastName: user.lastName || '',
//     email: user.email || '',
//     displayName: user.displayName || '',
//     type: user.type || '',
//     typeDescription: user.typeDescription || '',
//     registrationNumber: user.registrationNumber || '',
//     accountNumber: user.accountNumber || '',
//     bankName: user.bankName || '',
//     bankBranch: user.bankBranch || '',
//     streetAddress: user.streetAddress || '',
//     suburb: user.suburb || '',
//     ward: user.ward || '',
//     city: user.city || '',
//     areaCode: user.areaCode || '',
//     province: user.province || '',
//     country: user.country || '',
//   });

//   let userProductsSheet = workbook.addWorksheet('Produce', {
//     headerFooter: { firstHeader: 'Produce' },
//   });

//   userProductsSheet.columns = [
//     { header: 'Image', key: 'image' },
//     { header: 'Name', key: 'name' },
//     { header: 'Price', key: 'price' },
//   ];

//   let imageRow = 2;

//   produce.forEach((d) => {
//     let imageData = d.image.split(';');
//     let contentType = imageData[0].replace('data:', '');
//     let image = imageData[1].replace('base64,', '');
//     let bytes = atob(image);
//     let byteNumbers = new Array(bytes.length);

//     for (let i = 0; i < bytes.length; i++) {
//       byteNumbers[i] = bytes.charCodeAt(i);
//     }

//     let byteArray = new Uint8Array(byteNumbers);

//     let imagePath = path.join(
//       process.cwd(),
//       'temp',
//       v4() + '.' + contentType.split('/')[1]
//     );

//     fs.writeFileSync(imagePath, byteArray);

//     let imageId = workbook.addImage({
//       filename: imagePath,
//       extension: contentType.split('/')[1],
//     });

//     userProductsSheet.addImage(imageId, `A${imageRow}:A${imageRow}`);

//     userProductsSheet.addRow({
//       name: d.name || '',
//       price: 'R ' + d.price || '',
//     });

//     imageRow++;
//   });

//   let userSalesSheet = workbook.addWorksheet('Sales', {
//     headerFooter: { firstHeader: 'Sales' },
//   });

//   userSalesSheet.columns = [
//     { header: 'Date', key: 'date' },
//     {
//       header: 'Number Sold',
//       key: 'numberSold',
//     },
//     { header: 'Profit', key: 'profit' },
//     { header: 'Product Name', key: 'productName' },
//   ];

//   sales.forEach((d) => {
//     userSalesSheet.addRow({
//       date: moment(d.date).format('dddd/MM/YYYY') || '',
//       numberSold: d.numberSold || '',
//       profit: 'R ' + d.profit || '',
//       productName: d.product.name || '',
//     });
//   });

//   let userHarvestsSheet = workbook.addWorksheet('Harvests', {
//     headerFooter: { firstHeader: 'Harvests' },
//   });

//   userHarvestsSheet.columns = [
//     { header: 'Date', key: 'date' },
//     {
//       header: 'Yield',
//       key: 'yield',
//     },
//     { header: 'Weight', key: 'weight' },
//     { header: 'Produce Name', key: 'produceName' },
//   ];

//   harvests.forEach((d) => {
//     userHarvestsSheet.addRow({
//       date: moment(d.date).format('dddd/MM/YYYY') || '',
//       yield: d.yield || '',
//       weight: d.weight + ' kg' || '',
//       produceName: d.produceName || '',
//     });
//   });

//   userProfileSheet.columns.forEach((column) => {
//     const lengths = column.values.map((v) => v.toString().length);
//     column.width = Math.max(...lengths.filter((v) => typeof v === 'number'));
//   });

//   userProductsSheet.columns.forEach((column) => {
//     const lengths = column.values.map((v) => v.toString().length);
//     column.width = Math.max(...lengths.filter((v) => typeof v === 'number'));
//   });

//   userSalesSheet.columns.forEach((column) => {
//     const lengths = column.values.map((v) => v.toString().length);
//     column.width = Math.max(...lengths.filter((v) => typeof v === 'number'));
//   });

//   userHarvestsSheet.columns.forEach((column) => {
//     const lengths = column.values.map((v) => v.toString().length);
//     column.width = Math.max(...lengths.filter((v) => typeof v === 'number'));
//   });

//   workbook.xlsx
//     .writeFile(path.join(process.cwd(), 'temp', user.email + '-data.xlsx'))
//     .then(() => {
//       callback(path.join(process.cwd(), 'temp', user.email + '-data.xlsx'));

//       fs.unlinkSync(imagePath);
//     });
// };

// module.exports = router;
