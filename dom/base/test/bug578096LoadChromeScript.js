var file;
Components.utils.importGlobalProperties(["File"]);

addMessageListener("file.create", function (message) {
  file = Components.classes["@mozilla.org/file/directory_service;1"]
             .getService(Components.interfaces.nsIProperties)
             .get("TmpD", Components.interfaces.nsIFile);
  file.append("foo.txt");
  file.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0o600);
  File.createFromNsIFile(file).then(function(domFile) {
    sendAsyncMessage("file.created", domFile);
  });
});

addMessageListener("file.remove", function (message) {
  file.remove(false);
  sendAsyncMessage("file.removed", {});
});
