/*
* UI for ad-hoc comparison of Compatipede screenshots and data
* Sets up a grid showing screenshots
* X axis is variants (mainly engine+ua combos)
* Y axis is domains
* DnD - based: drop one screenshot on another to get a comparison of the screenshots and associated data
* Alternate UI: shift focus by arrows, use space to select for comparison. Second space executes comparison
* Framework? Isn't vanilla OK?
* Depends on resemble.js
*/

// Get a list of domains. Let's do 10 at a time - so /?domains=0-10

// TODO: keyboard functionality: arrow should skip over empty cells
// TODO: data diff'ing

(function(){
  var skip = 0;
  var limit = 10;
  var atOnce = 10;
  var grid, tbody, headerRow;
  var isOverlayOpen = false;
  document.addEventListener('DOMContentLoaded', function(){
    // first thing to do is to set up the grid..
    grid = document.body.appendChild(document.createElement('table'));
    grid.border = 0;
    tbody = grid.appendChild(document.createElement('tbody'));
    // At this point we don't know how many rows and columns we want
    // We do however know we want one header column with THs for the domains
    headerRow = tbody.appendChild(document.createElement('tr')); // can't use THEAD, didn't render correctly..?
    headerRow.appendChild(document.createElement('td')); // Empty cell above the site domain name column
    start();
    // controls for paging
    var controlsDiv = document.getElementById('controls');
    var prevBtn = controlsDiv.appendChild(document.createElement('button'));
    var nextBtn = controlsDiv.appendChild(document.createElement('button'));
    prevBtn.type = nextBtn.type = 'button';
    prevBtn.appendChild(document.createTextNode('<<'));
    nextBtn.appendChild(document.createTextNode('>>'));
    prevBtn.onclick = nextBtn.onclick = function(e){
      if(isOverlayOpen) return;
      if(e.target === prevBtn){
        skip -= atOnce;
        limit -= atOnce;
        if(skip < 0) {
          skip = 0;
          limit = atOnce;
          prevBtn.disabled = true;
          nextBtn.disabled = false;
        }
      }else if(e.target === nextBtn) {
        skip += atOnce;
        limit += atOnce;
        prevBtn.disabled = false;
        // TODO: do we know when to stop??
      }
      start();
    }
  }, false);
  
  function start() {
    while(grid.rows.length > 1) {
      tbody.removeChild(grid.rows[grid.rows.length-1]);
    }
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
  }

  // keyboard usage
  document.addEventListener('keydown', function(e){
    if(e.keyCode === 32) { // space toggles "selected"
      if(e.target.tagName === 'FIGURE') {
        e.target.classList.contains('selected') ? e.target.classList.remove('selected') : e.target.classList.add('selected');
        var sel = document.getElementsByClassName('selected');
        if(sel.length === 2) {
          compareStuff(sel[0], sel[1]);
        }
        e.preventDefault();
      }
    } else if(e.keyCode === 27) { // Esc 
      if(document.getElementsByClassName('overlay-img-background').length || document.getElementsByClassName('overlay-img-comparison').length) {
        document.body.removeChild(document.getElementsByClassName('overlay-img-background')[0]);
        document.body.removeChild(document.getElementsByClassName('overlay-img-comparison')[0]);
        isOverlayOpen = false;
      } else {
       while(document.getElementsByClassName('selected').length) {
         document.getElementsByClassName('selected')[0].classList.remove('selected');
       }
     }
    } else if(e.keyCode === 13 && ! isOverlayOpen) { // Enter
      enlarge(e.target);
    } else if((e.keyCode > 36 && e.keyCode < 41) && !isOverlayOpen && (['IMG', 'FIGURE'].indexOf(e.target.tagName) > -1)) {
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
      var recalculate = function(){
        if(e.keyCode === 37) {
          targetCellIdx --;
        } else if(e.keyCode === 38) {
          targetRowIdx --;
        } else if(e.keyCode === 39) {
          targetCellIdx ++;
        } else if(e.keyCode === 40) {
          targetRowIdx ++;
        }
      }
      var focusMoved = false;
      do{ // The do..while loop ensures we skip over empty cells in the table
        recalculate();
        if((targetRowIdx >= 1 && targetRowIdx < grid.rows.length) && (targetCellIdx >= 1 && targetCellIdx < grid.rows[targetRowIdx].cells.length)) {
          if(grid.rows[targetRowIdx] && grid.rows[targetRowIdx].cells[targetCellIdx]) {
            if(grid.rows[targetRowIdx].cells[targetCellIdx].getElementsByTagName('figure')[0]) {
              grid.rows[targetRowIdx].cells[targetCellIdx].getElementsByTagName('figure')[0].focus();
              focusMoved = true;
              e.preventDefault();
            }
          }
        } else {
          // out of bounds
          break;
        }
      }while(!focusMoved);
    }
    
  }, false);

  document.addEventListener('dblclick', function(e){enlarge(e.target);}, false);

  // The comparison fun..
  var dragElm, dragSite; // set when drag starts: dragElm is the <figure> we drag, dragSite is relevant domain name
  document.addEventListener('drag', function(e){
    dragElm = e.target.tagName === 'IMG' && e.target.classList.contains('screencapture') ? e.target.parentElement : e.target;
    dragSite = dragElm.getAttribute('data-site');
  }, false);
  document.addEventListener('dragover', function(e){
    // Prevent default to *allow* drop.. only if we're over a figure with same index
    var nowOver = e.target.tagName === 'IMG' && e.target.classList.contains('screencapture') ? e.target.parentElement : e.target;
    if(dragSite == nowOver.getAttribute('data-site')) {
      e.preventDefault();
    }
  }, false);
  document.addEventListener('drop', function(e){
    var dropTarget = (e.target.tagName === 'IMG' && e.target.classList.contains('screencapture')) ? e.target.parentElement : e.target;
    // dropTarget should be set to the <figure> element
    compareStuff(dropTarget, dragElm);
    e.preventDefault();
    dragSite = dragElm = null;
  }, false);

  document.addEventListener('scroll', function(e){
    // If the focused element is off-screen, blur it
    // otherwise using arrow keys when some off-screen element has focus will jump to a surprising place
    if(!document.activeElement) return;
    var doctop = Math.max(document.documentElement.scrollTop, document.body.scrollTop);
    var elm = document.activeElement;
    var elmbottom = elm.offsetHeight + elm.offsetTop;
    while(elm.offsetParent) {
      elmbottom = elm.offsetParent.offsetTop;
      elm = elm.offsetParent;
    }
    if(elmbottom < doctop || elmbottom - elm.offsetHeight > doctop + window.innerHeight) {
      elm.blur();
    }
  }, false);

  function compareStuff(elm1, elm2){ // expects figure elements with .doc data
    // launches the image comparison for the IMG inside the FIGURE elements
    compareImgs(elm1.getElementsByTagName('img')[0].src, elm2.getElementsByTagName('img')[0].src);
    var delta = jsondiffpatch.diff(elm1.doc.jobResults, elm2.doc.jobResults);
    // TODO: find a nicer way...
    var interval = setInterval(function(){
      if(document.getElementsByClassName('overlay-img-comparison')[0]) {
        document.getElementsByClassName('overlay-img-comparison')[0].appendChild(document.createElement('div')).innerHTML = jsondiffpatch.formatters.html.format(delta, elm1.doc);
        clearInterval(interval);
      }
    }, 200);
  }

  function enlarge(target){
    if(target.tagName === 'FIGURE') {
      var img = target.getElementsByTagName('img')[0];
    } else {
      var img = target;
    }
    if(img && img.tagName === 'IMG') {
      var elm = showOverlay(img.cloneNode(true));
      if(img.parentElement.doc) {
      }
    }
  }


  function compareImgs(img1, img2){
    resemble(img1).compareTo(img2).onComplete(showComparison);
  }
  
  function showComparison(data){
    var diffImage = document.createElement('img');
		diffImage.src = data.getImageDataUrl();
    return showOverlay(diffImage);
  }

  function showOverlay(imgElm){
    var div = document.body.appendChild(document.createElement('div'));
    div.className = 'overlay-img-background';
    div.title = 'Use [Esc] key to close image view and return to table';
    div = document.body.appendChild(document.createElement('div'));
    div.className = 'overlay-img-comparison';
    div.style.height = window.innerHeight + 'px';
    console.log(div.style.height);
    div = div.appendChild(document.createElement('div'));
    div.className = 'overlay-img-comparison-scrollparent';
    div.appendChild(imgElm);
    isOverlayOpen = true;
    return div;
  }
  
  function addScreenshotsToGrid(doc){
    var id = doc.id;
    var key = doc.key; // this is actually the domain name here
    doc = doc.value;
    // this is where it gets a little tricky:
    // do we have a row for this site yet, or a column for this variant?
    // let's define "variantID" as 
    // doc.jobDetails.domain + engine + type + userAgent 
    var variantID = doc.jobDetails.engine + doc.jobDetails.type + doc.jobDetails.userAgent;
    variantID = variantID.toLowerCase().replace(/[^a-z0-9_]+/g, '');
    var columnHeader = document.getElementById(variantID);
    if(!columnHeader) {
      columnHeader = addVariantIDColumn(variantID);
    }
    // Now, we shall not assume that documents are always returned in the same order
    // We need to find the row for this domain, and if none exist insert one
    var siteRow = document.getElementById(key);
    if(!siteRow) {
      siteRow = tbody.appendChild(document.createElement('tr'));
      siteRow.id = key;
      siteRow.appendChild(document.createElement('th')).appendChild(document.createTextNode(key));
      // We just added a nearly empty row, so we need to fill it with cells until the expected length
      while(siteRow.cells.length < headerRow.cells.length) {
        siteRow.appendChild(document.createElement('td')).className = 'screencapcell';
      }
    }
    // which index in the header is the current variant?
    var headIndex = -1, cell;
    for(var i = 0; i < headerRow.cells.length; i++) {
      if(headerRow.cells[i] === columnHeader) {
        headIndex = i;
        break;
      }
    }

    // now we're ready to pick the right cell to add our screenshot to
    cell = siteRow.cells[headIndex];
    if(!cell) {
      // huh?
      cell = siteRow.appendChild(document.createElement('td'));
      cell.className = 'screencapcell';
    }
    // We add only one attachment for each variant - hence the length === 0 check
    // Attachments seem to get enumerated in FILO order so we get the newest
    // image by limiting it to one.. (Wil this always be correct??)
    if(doc._attachments && cell.getElementsByTagName('img').length === 0) {
      var attachment = Object.keys(doc._attachments)[0];
      var div = cell.appendChild(document.createElement('div'));
      var fig = div.appendChild(document.createElement('figure'));
      var img = fig.appendChild(document.createElement('img'));
      img.className = 'screencapture';
      img.src = '/?attachment=' + encodeURIComponent(attachment) + '&doc=' + encodeURIComponent(id);
      fig.tabIndex = 0; // focusable for keyboard navigation
      fig.draggable = true;
      fig.setAttribute('data-site', key);
      fig.appendChild(document.createElement('figcaption')).appendChild(document.createTextNode(
       key + ' captured ' + doc.jobResults.date + ' rendered by ' + doc.jobDetails.engine + '\n' + doc.jobDetails.userAgent));
      fig.doc = doc;
    }
  }
  
  function addVariantIDColumn(id){
    var th = headerRow.appendChild(document.createElement('th'));
    th.id = id;
    // We are going to assume that no other document so far needed this column
    // meaning we should add one empty cell to each row
    for(var i = 1; i < grid.rows.length - 1; i++){
      grid.rows[i].appendChild(document.createElement('td')).className = 'screencapcell';
    }
    return th;
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