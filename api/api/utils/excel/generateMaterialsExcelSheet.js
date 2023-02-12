let fs = require('fs');
let path = require('path');
let ExcelJS = require('exceljs');
let moment = require('moment');
const { v4 } = require('uuid');

const generateMaterialsExcelSheet = async (materialsData, callback) => {
  try {
    let workbook = new ExcelJS.Workbook();

    workbook.creator = '3rEco';
    workbook.lastModifiedBy = '3rEco Server';
    workbook.created = new Date();
    workbook.modified = new Date();

    let materialsSheet = workbook.addWorksheet('Materials', {
      headerFooter: { firstHeader: 'Owner' },
    });

    materialsSheet.columns = [
      { header: 'Owner', key: 'owner' },
      { header: 'Type', key: 'type' },
      { header: 'Value', key: 'value' },
    ];

    materialsData.forEach((material) => {
      materialsSheet.addRow({
        owner: material.owner || 'Unspecified',
        type: material.type || 'Unspecified',
        value: 'R ' + material.value || 'Unspecified',
      });
    });

    materialsSheet.columns.forEach((column) => {
      const lengths = column.values.map((v) => v.toString().length);
      column.width = Math.max(...lengths.filter((v) => typeof v === 'number'));
    });

    const id = v4();

    workbook.xlsx
      .writeFile(path.join(process.cwd(), 'temp', id + 'materials.xlsx'))
      .then(() => {
        callback(
          path.join(process.cwd(), 'temp', id + 'materials.xlsx'),
          'materials.xlsx'
        );
      });
  } catch (error) {
    console.log(error);
  }
};

module.exports = generateMaterialsExcelSheet;
