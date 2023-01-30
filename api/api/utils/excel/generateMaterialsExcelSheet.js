let fs = require('fs');
let path = require('path');
let ExcelJS = require('exceljs');
let moment = require('moment');

const generateMaterialsExcelSheet = async (materialsData, callback) => {
  try {
    let workbook = new ExcelJS.Workbook();

    workbook.creator = '3rEco';
    workbook.lastModifiedBy = '3rEco Server';
    workbook.created = new Date();
    workbook.modified = new Date();

    let materialsSheet = workbook.addWorksheet('Materials', {
      headerFooter: { firstHeader: 'Profile' },
    });
  } catch (error) {}
};

module.exports = generateMaterialsExcelSheet;
