/*
* UI for ad-hoc comparison of Compatipede screenshots and data
* Sets up a grid showing screenshots
* X axis is domains
* Y axis is variants (mainly engine+ua combos)
* DnD - based: drop one screenshot on another to get a comparison of the screenshots and associated data
* Alternate UI: shift focus by arrows, use space to select for comparison. Second space executes comparison
* Framework? Isn't vanilla OK?
* Depends on resemble.js
*/

// Get a list of domains. Let's do 10 at a time - so /?domains=0-10
(function(){
  var skip = 2;
  var limit = 15;
  var grid, tbody, headerRow;
  document.addEventListener('DOMContentLoaded', function(){
    // first thing to do is to set up the grid..
    grid = document.body.appendChild(document.createElement('table'));
    grid.border = 0;
    tbody = grid.appendChild(document.createElement('tbody'));
    // At this point we don't know how many rows and columns we want
    // We do however know we want one header column with THs for the domains
    headerRow = tbody.appendChild(document.createElement('tr')); // can't use THEAD, didn't render correctly..?
    
    // Start piling up the requests and callbacks..
    listDomains(skip, limit, function(){
      this.response.forEach(function(obj){
        getDocumentsForDomain(obj.key, function(){
          this.response.forEach(function(obj){
            addScreenshotsToGrid(obj);
          });
        });
      });
    });
  }, false);
  
  // keyboard usage
  document.addEventListener('keydown', function(e){
    if(e.keyCode === 32) { // space toggles "selected"
      if(e.target.tagName === 'FIGURE') {
        e.target.classList.contains('selected') ? e.target.classList.remove('selected') : e.target.classList.add('selected');
        var sel = document.getElementsByClassName('selected');
        if(sel.length === 2) {
          compareImgs(sel[0].getElementsByTagName('img')[0].src, sel[1].getElementsByTagName('img')[0].src);
        }
        e.preventDefault();
      }
    } else if(e.keyCode === 27) { // Esc 
      if(document.getElementsByClassName('overlay-img-background').length || document.getElementsByClassName('overlay-img-comparison').length) {
        document.body.removeChild(document.getElementsByClassName('overlay-img-background')[0]);
        document.body.removeChild(document.getElementsByClassName('overlay-img-comparison')[0]);
      } else {
       while(document.getElementsByClassName('selected').length) {
         document.getElementsByClassName('selected')[0].classList.remove('selected');
       }
     }
    } else if(e.keyCode > 36 && e.keyCode < 41) {
      // Arrow keys. Tricky.. It would be nice to enable focus navigation with arrow keys,
      // but it will interfere with scrolling I suppose..
      var targetRowIdx, targetCellIdx;
      for(var i = 1; i < grid.rows.length; i++){
        for(var j = 0; j < grid.rows[i].cells.length; j++) {
          if(grid.rows[i].cells[j].contains(e.target)) {
            targetRowIdx = i;
            targetCellIdx = j;
            break;
          }
        }
      }
      if(e.keyCode === 37) {
        targetCellIdx --;
      } else if(e.keyCode === 38) {
        targetRowIdx --;
      } else if(e.keyCode === 39) {
        targetCellIdx ++;
      } else if(e.keyCode === 40) {
        targetRowIdx ++;
      }
      if(grid.rows[targetRowIdx] && grid.rows[targetRowIdx].cells[targetCellIdx]) {
        if(grid.rows[targetRowIdx].cells[targetCellIdx].getElementsByTagName('figure')[0]) {
          grid.rows[targetRowIdx].cells[targetCellIdx].getElementsByTagName('figure')[0].focus();
          e.preventDefault();
        }
      }
    }
    
  }, false);
  
  // The comparison fun..
  var dragElm, dragIdx
  document.addEventListener('drag', function(e){
    dragElm = e.target.tagName === 'IMG' && e.target.classList.contains('screencapture') ? e.target.parentElement : e.target;
    dragIdx = dragElm.getAttribute('data-cellidx');
  }, false);
  document.addEventListener('dragover', function(e){
    // Prevent default to *allow* drop.. only if we're over a figure with same index
    var nowOver = e.target.tagName === 'IMG' && e.target.classList.contains('screencapture') ? e.target.parentElement : e.target;
    if(dragIdx == nowOver.getAttribute('data-cellidx')) {
      e.preventDefault();
    }
  }, false);
  document.addEventListener('drop', function(e){
    compareImgs(e.target.src||e.target.getElementsByTagName('img')[0].src, dragElm.getElementsByTagName('img')[0].src);
    e.preventDefault();
    dragIdx = dragElm = null;
  }, false);
  
  function compareImgs(img1, img2){
    resemble(img1).compareTo(img2).onComplete(showComparison);
  }
  
  function showComparison(data){
    var diffImage = document.createElement('img');
		diffImage.src = data.getImageDataUrl();
    var div = document.body.appendChild(document.createElement('div'));
    div.className = 'overlay-img-background';
    div = document.body.appendChild(document.createElement('div'));
    div.className = 'overlay-img-comparison';
    div.style.left = (document.documentElement.scrollLeft + (screen.width*20/100)) + 'px';
    div.appendChild(diffImage);
  }
  
  function addScreenshotsToGrid(doc){
    var id = doc.id;
    var key = doc.key;
    doc = doc.value;
    // this is where it gets a little tricky:
    // do we have a row for this variant yet?
    // let's define "variantID" as 
    // doc.jobDetails.domain + engine + type + userAgent 
    var variantID = doc.jobDetails.engine + doc.jobDetails.type + doc.jobDetails.userAgent;
    variantID = variantID.toLowerCase().replace(/[^a-z0-9_]+/g, '');
    var row = document.getElementById(variantID);
    if(!row) {
      row = addVariantIDRow(variantID);
    }
    // Now, we shall now assume that documents are always returned in the same order
    // We need to find the index of the header cell for this domain,
    // and if none exist insert one
    var headIndex = -1, cell;
    for(var i = 0; i < headerRow.cells.length; i++) {
      if(headerRow.cells[i].textContent === key) {
        headIndex = i;
        break;
      }
    }
    if(headIndex === -1) {
      headerRow.appendChild(document.createElement('th')).textContent = key;
      headIndex = headerRow.cells.length - 1;
      // Now, each row must have the same number of cells
      // We go through them all to add anything missing in case we added another TH
      for(var j = 1; j < grid.rows.length; j++){
        while(grid.rows[j].cells.length < headIndex + 1){
          // we somehow have too few cells in this row, let's add some..
          cell = grid.rows[j].appendChild(document.createElement('td'));
          cell.className = 'screencapcell';
        }
      }
    }
    // now we're ready to pick the right cell to add our screenshot to
    cell = row.cells[headIndex];
    if(!cell) {
      // huh?
      cell = row.appendChild(document.createElement('td'));
      cell.className = 'screencapcell';
    }
    if(doc._attachments) {
      var attachment = Object.keys(doc._attachments)[0];
      var div = cell.appendChild(document.createElement('div'));
      var fig = div.appendChild(document.createElement('figure'));
      var img = fig.appendChild(document.createElement('img'));
      img.className = 'screencapture';
      img.src = '/?attachment=' + encodeURIComponent(attachment) + '&doc=' + encodeURIComponent(id);
      fig.tabIndex = 0; // focusable for keyboard navigation
      fig.draggable = true;
      fig.setAttribute('data-cellidx', headIndex);
      fig.appendChild(document.createElement('figcaption')).appendChild(document.createTextNode(
       key + ' captured ' + doc.jobResults.date + ' rendered by ' + doc.jobDetails.engine + '\n' + doc.jobDetails.userAgent));
      fig.doc = doc;
    }
  }
  
  function addVariantIDRow(id){
    var tr = tbody.appendChild(document.createElement('tr'));
    tr.id = id;
    // We are going to assume that no other document so far needed this row
    // meaning we should fill it with empty cells until it's as long as 
    // the current rows are
    for(var i = 0; i < headerRow.cells.length - 1; i++){
      tr.appendChild(document.createElement('td')).className = 'screencapcell';
    }
    return tr;
  }
  
  function getDocumentsForDomain(domain, cb){
    return get('/?domain=' + encodeURIComponent(domain) + '&withResources=false', cb);
  }
  
  function listDomains(skip, limit, cb){
    return get('/?domains=' + skip + '-' + limit, cb);
  }
  
  function get(url, cb){
    var x = new XMLHttpRequest();
    x.open('GET', url, true);
    x.responseType = 'json';
    x.onload = cb;
    x.send();
    return x;
  }
  
})();