let fs = require('fs');
let path = require('path');
let ExcelJS = require('exceljs');
let moment = require('moment');
const { v4 } = require("uuid");

const generateUsersExcelSheet = async (users, callback) => {
  try {
    let workbook = new ExcelJS.Workbook();

    workbook.creator = '3rEco';
    workbook.lastModifiedBy = '3rEco Server';
    workbook.created = new Date();
    workbook.modified = new Date();

    let usersSheet = workbook.addWorksheet('Users', {
      headerFooter: { firstHeader: 'Phone Number' },
    });

    usersSheet.columns = [
      { header: 'Phone Number', key: 'phoneNumber' },
      { header: 'Completed Profile', key: 'completedProfile' },
      { header: 'Agreed To Terms', key: 'agreedToTerms' },
      { header: 'First Name', key: 'firstName' },
      { header: 'Last Name', key: 'lastName' },
      { header: 'ID Number', key: 'idNumber' },
      { header: 'Business Name', key: 'businessName' },
      {
        header: 'Business Registration Number',
        key: 'businessRegistrationNumber',
      },
      { header: 'Street Address', key: 'streetAddress' },
      { header: 'City', key: 'city' },
      { header: 'Area Code', key: 'areaCode' },
      { header: 'Province', key: 'province' },
      { header: 'User Type', key: 'userType' },
    ];

    users.forEach((user) => {
      usersSheet.addRow({
        phoneNumber: user.phoneNumber || 'Unspecified',
        completedProfile: user.completedProfile || 'Unspecified',
        agreedToTerms: user.agreedToTerms || 'Unspecified',
        firstName: user.firstName || 'Unspecified',
        lastName: user.lastName || 'Unspecified',
        idNumber: user.idNumber || 'Unspecified',
        businessName: user.businessName || 'Unspecified',
        businessRegistrationNumber:
          user.businessRegistrationNumber || 'Unspecified',
        streetAddress: user.streetAddress || 'Unspecified',
        city: user.city || 'Unspecified',
        areaCode: user.areaCode || 'Unspecified',
        province: user.province || 'Unspecified',
        userType: user.userType || 'Unspecified',
      });
    });

    usersSheet.columns.forEach((column) => {
      const lengths = column.values.map((v) => v.toString().length);
      column.width = Math.max(...lengths.filter((v) => typeof v === 'number'));
    });

    const id = v4()

    workbook.xlsx
      .writeFile(path.join(process.cwd(), 'temp', id + 'users.xlsx'))
      .then(() => {
        callback(path.join(process.cwd(), 'temp', id + 'users.xlsx'), 'users.xlsx');
      });
  } catch (error) {
    console.log(error);
  }
};

module.exports = generateUsersExcelSheet;
