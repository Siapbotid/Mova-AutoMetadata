 function doGet(e) { 
   // Ambil parameter dari URL permintaan 
   var email = e.parameter.email; 
   var machineId = e.parameter.machineId; 
 
   // Check that email and machineId are present 
   if (!email || !machineId) { 
     return ContentService 
       .createTextOutput(JSON.stringify({ status: 'error', message: 'Email and Machine ID are required.' })) 
       .setMimeType(ContentService.MimeType.JSON); 
   } 
 
   try { 
     // Open the active spreadsheet and the specific sheet 
     var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Auto MetaData'); 
 
     // If the sheet is not found, return a clear error 
     if (!sheet) { 
       return ContentService 
         .createTextOutput(JSON.stringify({ status: 'error', message: 'Sheet "Auto MetaData" was not found.' })) 
         .setMimeType(ContentService.MimeType.JSON); 
     } 
 
     // Get all data from the sheet 
     var dataRange = sheet.getDataRange(); 
     var values = dataRange.getValues(); 
 
     var userRowIndex = -1; // Akan menyimpan indeks baris pengguna yang ditemukan 
 
     // Find the matching email 
     for (var i = 1; i < values.length; i++) { // Mulai dari baris kedua (indeks 1) untuk melewati header 
       var rowEmail = values[i][0]; 
       if (rowEmail && rowEmail.toLowerCase() === email.toLowerCase()) { 
         userRowIndex = i; 
         break; 
       } 
     } 
 
     // If the email is not found 
     if (userRowIndex === -1) { 
       return ContentService 
         .createTextOutput(JSON.stringify({ status: 'error', message: 'This email is not registered.' })) 
         .setMimeType(ContentService.MimeType.JSON); 
     } 
 
     // Ambil data untuk baris pengguna yang ditemukan 
     var userData = values[userRowIndex]; 
     var machineId1 = userData[1]; // Kolom B 
     var machineId2 = userData[2]; // Kolom C 
     var machineId3 = userData[3]; // Kolom D 
     var expiryDateValue = userData[4]; // Kolom E 
 
     // Check the license expiry date 
     if (!expiryDateValue) { 
       return ContentService 
         .createTextOutput(JSON.stringify({ status: 'error', message: 'No expiry date was found for this email.' })) 
         .setMimeType(ContentService.MimeType.JSON); 
     } 
 
     var today = new Date(); 
     var expDate = new Date(expiryDateValue); 
 
     // Align times to midnight for accurate date comparison 
     today.setHours(0, 0, 0, 0); 
     expDate.setHours(0, 0, 0, 0); 
 
     if (expDate < today) { 
       return ContentService 
         .createTextOutput(JSON.stringify({ status: 'error', message: 'The license has expired.' })) 
         .setMimeType(ContentService.MimeType.JSON); 
     } 
 
     // Check Machine ID columns 1, 2, and 3 
     var machineIdFound = false; 
     var emptyColumnIndex = -1; // Akan menyimpan indeks kolom kosong pertama (1-based) 
 
     for (var j = 1; j <= 3; j++) { // Kolom B, C, D adalah indeks 1, 2, 3 dalam array userData 
       var storedMachineId = userData[j]; 
       if (storedMachineId && storedMachineId === machineId) { 
         machineIdFound = true; 
         break; 
       } 
       if (!storedMachineId && emptyColumnIndex === -1) { 
         emptyColumnIndex = j; // Simpan indeks kolom (0-based) 
       } 
     } 
 
     // If the Machine ID already exists in one of the columns 
     if (machineIdFound) { 
       return ContentService 
         .createTextOutput(JSON.stringify({ status: 'success', message: 'License validation succeeded.' })) 
         .setMimeType(ContentService.MimeType.JSON); 
     } 
 
     // If the Machine ID is not found but there is an empty slot 
     if (emptyColumnIndex !== -1) { 
       // Update the sheet with the new Machine ID 
       // userRowIndex + 1 and emptyColumnIndex + 1 because getRange uses 1-based indices 
       sheet.getRange(userRowIndex + 1, emptyColumnIndex + 1).setValue(machineId); 
       return ContentService 
         .createTextOutput(JSON.stringify({ status: 'success', message: 'License validated and the new Machine ID has been registered.' })) 
         .setMimeType(ContentService.MimeType.JSON); 
     } 
 
     // If the Machine ID does not match and there are no empty slots 
 
  } catch (error) { 
    return ContentService 
      .createTextOutput(JSON.stringify({ status: 'error', message: 'Server error: ' + error.message })) 
      .setMimeType(ContentService.MimeType.JSON); 
  } 
}