let fs = require('fs');
let path = require('path');
let ExcelJS = require('exceljs');
let moment = require('moment');

const generateEcdUserExcelSheet = async (
  userData,
  produceData,
  harvestsData,
  salesData,
  callback = (path) => {}
) => {
  try {
    let workbook = new ExcelJS.Workbook();

    workbook.creator = 'Purpose360';
    workbook.lastModifiedBy = 'Purpose360 Server';
    workbook.created = new Date();
    workbook.modified = new Date();

    let userProfileSheet = workbook.addWorksheet('Profile', {
      headerFooter: { firstHeader: 'Profile' },
    });

    userProfileSheet.columns = [
      { header: 'First Name', key: 'firstName' },
      {
        header: 'Last Name',
        key: 'lastName',
      },
      {
        header: 'ID Number',
        key: 'idNumber',
      },
      {
        header: 'Age',
        key: 'age',
      },
      {
        header: 'Gender',
        key: 'gender',
      },
      {
        header: 'Ethnicity',
        key: 'ethnicity',
      },
      {
        header: 'Email',
        key: 'email',
      },
      { header: 'Business Name', key: 'businessName' },
      {
        header: 'Business Type',
        key: 'businessType',
      },
      { header: 'Business Description', key: 'businessTypeDescription' },
      { header: 'Business Registered', key: 'businessRegistered' },
      {
        header: 'Business Registration Number',
        key: 'registrationNumber',
      },
      {
        header: 'Number of Employees',
        key: 'businessNumberOfEmployees',
      },
      { header: 'Bank Account Number', key: 'accountNumber' },
      {
        header: 'Bank Name',
        key: 'bankName',
      },
      { header: 'Bank Branch Code', key: 'bankBranchCode' },
      {
        header: 'Street Address',
        key: 'streetAddress',
      },
      { header: 'Suburb', key: 'suburb' },
      { header: 'Ward', key: 'ward' },
      {
        header: 'City',
        key: 'city',
      },
      { header: 'Area Code', key: 'areaCode' },
      { header: 'Province', key: 'province' },
      {
        header: 'Country',
        key: 'country',
      },
    ];

    userProfileSheet.addRow({
      firstName: userData.firstName || 'Unspecified',
      lastName: userData.lastName || 'Unspecified',
      idNumber: userData.idNumber || 'Unspecified',
      age: userData.age || 'Unspecified',
      gender: userData.gender || 'Unspecified',
      ethnicity: userData.ethnicity || 'Unspecified',
      email: userData.email || 'Unspecified',
      businessName: userData.businessName || 'Unspecified',
      businessType: userData.businessType || 'Unspecified',
      businessTypeDescription:
        userData.businessTypeDescription || 'Unspecified',
      businessRegistered: userData.businessRegistered
        ? 'yes'
        : 'no' || 'Unspecified',
      businessRegistrationNumber:
        userData.businessRegistrationNumber || 'Unspecified',
      businessNumberOfEmployees:
        userData.businessNumberOfEmployees || 'Unspecified',
      accountNumber: userData.accountNumber || 'Unspecified',
      bankName: userData.bankName || 'Unspecified',
      bankBranchCode: userData.bankBranchCode || 'Unspecified',
      streetAddress: userData.streetAddress || 'Unspecified',
      suburb: userData.suburb || 'Unspecified',
      ward: userData.ward || 'Unspecified',
      city: userData.city || 'Unspecified',
      areaCode: userData.areaCode || 'Unspecified',
      province: userData.province || 'Unspecified',
      country: userData.country || 'Unspecified',
    });

    let userProduceSheet = workbook.addWorksheet('Products', {
      headerFooter: { firstHeader: 'Products' },
    });

    userProduceSheet.columns = [
      { header: 'Image', key: 'image' },
      { header: 'Name', key: 'name' },
      { header: 'Price', key: 'price' },
    ];

    let imageRow = 2;

    produceData.forEach((d) => {
      let imageData = d.image.split(';');
      let contentType = imageData[0].replace('data:', '');
      let image = imageData[1].replace('base64,', '');
      let bytes = atob(image);
      let byteNumbers = new Array(bytes.length);

      for (let i = 0; i < bytes.length; i++) {
        byteNumbers[i] = bytes.charCodeAt(i);
      }

      let byteArray = new Uint8Array(byteNumbers);

      let imagePath = path.join(
        process.cwd(),
        'temp',
        d._id + '.' + contentType.split('/')[1]
      );

      fs.writeFileSync(imagePath, byteArray);

      let imageId = workbook.addImage({
        filename: imagePath,
        extension: contentType.split('/')[1],
      });

      userProduceSheet.addImage(imageId, `A${imageRow}:A${imageRow}`);

      userProduceSheet.addRow({
        name: d.name || 'Unspecified',
        price: 'R ' + d.price || 'Unspecified',
      });

      imageRow++;
    });

    let userHarvestsSheet = workbook.addWorksheet('Harvests', {
      headerFooter: { firstHeader: 'Harvests' },
    });

    userHarvestsSheet.columns = [
      { header: 'Date', key: 'date' },
      {
        header: 'Yield',
        key: 'yield',
      },
      { header: 'Weight', key: 'weight' },
      { header: 'Produce Name', key: 'produceName' },
    ];

    harvestsData.forEach((d) => {
      userHarvestsSheet.addRow({
        date: moment(d.date).format('dddd/MM/YYYY') || 'Unspecified',
        yield: d.yield || 'Unspecified',
        weight: d.yield + 'kg' || 'Unspecified',
        produceName: d.produce.name || 'Unspecified',
      });
    });

    let userSalesSheet = workbook.addWorksheet('Sales', {
      headerFooter: { firstHeader: 'Sales' },
    });

    userSalesSheet.columns = [
      { header: 'Date', key: 'date' },
      {
        header: 'Number Sold',
        key: 'numberSold',
      },
      { header: 'Profit', key: 'profit' },
      { header: 'Product Name', key: 'productName' },
    ];

    salesData.forEach((d) => {
      userSalesSheet.addRow({
        date: moment(d.date).format('dddd/MM/YYYY') || 'Unspecified',
        numberSold: d.numberSold || 'Unspecified',
        profit: 'R ' + d.profit || 'Unspecified',
        productName: d.product.name || 'Unspecified',
      });
    });

    userProfileSheet.columns.forEach((column) => {
      const lengths = column.values.map((v) => v.toString().length);
      column.width = Math.max(...lengths.filter((v) => typeof v === 'number'));
    });

    userProduceSheet.columns.forEach((column) => {
      const lengths = column.values.map((v) => v.toString().length);
      column.width = Math.max(...lengths.filter((v) => typeof v === 'number'));
    });

    userHarvestsSheet.columns.forEach((column) => {
      const lengths = column.values.map((v) => v.toString().length);
      column.width = Math.max(...lengths.filter((v) => typeof v === 'number'));
    });

    userSalesSheet.columns.forEach((column) => {
      const lengths = column.values.map((v) => v.toString().length);
      column.width = Math.max(...lengths.filter((v) => typeof v === 'number'));
    });

    workbook.xlsx
      .writeFile(
        path.join(process.cwd(), 'temp', userData.email + '-data.xlsx')
      )
      .then(() => {
        callback(
          path.join(process.cwd(), 'temp', userData.email + '-data.xlsx')
        );
      });
  } catch (error) {
    console.log(error);
  }
};

const generateStandardUserExcelSheet = async (
  userData,
  productsData,
  salesData,
  callback = (path) => {}
) => {
  try {
    let workbook = new ExcelJS.Workbook();

    workbook.creator = 'Purpose360';
    workbook.lastModifiedBy = 'Purpose360 Server';
    workbook.created = new Date();
    workbook.modified = new Date();

    let userProfileSheet = workbook.addWorksheet('Profile', {
      headerFooter: { firstHeader: 'Profile' },
    });

    userProfileSheet.columns = [
      { header: 'First Name', key: 'firstName' },
      {
        header: 'Last Name',
        key: 'lastName',
      },
      {
        header: 'ID Number',
        key: 'idNumber',
      },
      {
        header: 'Age',
        key: 'age',
      },
      {
        header: 'Gender',
        key: 'gender',
      },
      {
        header: 'Ethnicity',
        key: 'ethnicity',
      },
      {
        header: 'Email',
        key: 'email',
      },
      { header: 'Business Name', key: 'businessName' },
      {
        header: 'Business Type',
        key: 'businessType',
      },
      { header: 'Business Description', key: 'businessTypeDescription' },
      { header: 'Business Registered', key: 'businessRegistered' },
      {
        header: 'Business Registration Number',
        key: 'registrationNumber',
      },
      {
        header: 'Number of Employees',
        key: 'businessNumberOfEmployees',
      },
      { header: 'Bank Account Number', key: 'accountNumber' },
      {
        header: 'Bank Name',
        key: 'bankName',
      },
      { header: 'Bank Branch Code', key: 'bankBranchCode' },
      {
        header: 'Street Address',
        key: 'streetAddress',
      },
      { header: 'Suburb', key: 'suburb' },
      { header: 'Ward', key: 'ward' },
      {
        header: 'City',
        key: 'city',
      },
      { header: 'Area Code', key: 'areaCode' },
      { header: 'Province', key: 'province' },
      {
        header: 'Country',
        key: 'country',
      },
    ];

    userProfileSheet.addRow({
      firstName: userData.firstName || 'Unspecified',
      lastName: userData.lastName || 'Unspecified',
      idNumber: userData.idNumber || 'Unspecified',
      age: userData.age || 'Unspecified',
      gender: userData.gender || 'Unspecified',
      ethnicity: userData.ethnicity || 'Unspecified',
      email: userData.email || 'Unspecified',
      businessName: userData.businessName || 'Unspecified',
      businessType: userData.businessType || 'Unspecified',
      businessTypeDescription:
        userData.businessTypeDescription || 'Unspecified',
      businessRegistered: userData.businessRegistered
        ? 'yes'
        : 'no' || 'Unspecified',
      businessRegistrationNumber:
        userData.businessRegistrationNumber || 'Unspecified',
      businessNumberOfEmployees:
        userData.businessNumberOfEmployees || 'Unspecified',
      accountNumber: userData.accountNumber || 'Unspecified',
      bankName: userData.bankName || 'Unspecified',
      bankBranchCode: userData.bankBranchCode || 'Unspecified',
      streetAddress: userData.streetAddress || 'Unspecified',
      suburb: userData.suburb || 'Unspecified',
      ward: userData.ward || 'Unspecified',
      city: userData.city || 'Unspecified',
      areaCode: userData.areaCode || 'Unspecified',
      province: userData.province || 'Unspecified',
      country: userData.country || 'Unspecified',
    });

    let userProductsSheet = workbook.addWorksheet('Products', {
      headerFooter: { firstHeader: 'Products' },
    });

    userProductsSheet.columns = [
      { header: 'Image', key: 'image' },
      { header: 'Name', key: 'name' },
      {
        header: 'Cost',
        key: 'cost',
      },
      { header: 'Price', key: 'price' },
    ];

    let imageRow = 2;

    productsData.forEach((d) => {
      let imageData = d.image.split(';');
      let contentType = imageData[0].replace('data:', '');
      let image = imageData[1].replace('base64,', '');
      let bytes = atob(image);
      let byteNumbers = new Array(bytes.length);

      for (let i = 0; i < bytes.length; i++) {
        byteNumbers[i] = bytes.charCodeAt(i);
      }

      let byteArray = new Uint8Array(byteNumbers);

      let imagePath = path.join(
        process.cwd(),
        'temp',
        d._id + '.' + contentType.split('/')[1]
      );

      fs.writeFileSync(imagePath, byteArray);

      let imageId = workbook.addImage({
        filename: imagePath,
        extension: contentType.split('/')[1],
      });

      userProductsSheet.addImage(imageId, `A${imageRow}:A${imageRow}`);

      userProductsSheet.addRow({
        name: d.name || '',
        cost: 'R ' + d.cost || '',
        price: 'R ' + d.price || '',
      });

      imageRow++;
    });

    let userSalesSheet = workbook.addWorksheet('Sales', {
      headerFooter: { firstHeader: 'Sales' },
    });

    userSalesSheet.columns = [
      { header: 'Date', key: 'date' },
      {
        header: 'Number Sold',
        key: 'numberSold',
      },
      { header: 'Profit', key: 'profit' },
      { header: 'Product Name', key: 'productName' },
    ];

    salesData.forEach((d) => {
      userSalesSheet.addRow({
        date: moment(d.date).format('dddd/MM/YYYY') || '',
        numberSold: d.numberSold || '',
        profit: 'R ' + d.profit || '',
        productName: d.product.name || '',
      });
    });

    userProfileSheet.columns.forEach((column) => {
      const lengths = column.values.map((v) => v.toString().length);
      column.width = Math.max(...lengths.filter((v) => typeof v === 'number'));
    });

    userProductsSheet.columns.forEach((column) => {
      const lengths = column.values.map((v) => v.toString().length);
      column.width = Math.max(...lengths.filter((v) => typeof v === 'number'));
    });

    userSalesSheet.columns.forEach((column) => {
      const lengths = column.values.map((v) => v.toString().length);
      column.width = Math.max(...lengths.filter((v) => typeof v === 'number'));
    });

    workbook.xlsx
      .writeFile(
        path.join(process.cwd(), 'temp', userData.email + '-data.xlsx')
      )
      .then(() => {
        callback(
          path.join(process.cwd(), 'temp', userData.email + '-data.xlsx')
        );
      });
  } catch (error) {
    console.log(error);
  }
};

module.exports = { generateEcdUserExcelSheet, generateStandardUserExcelSheet };
