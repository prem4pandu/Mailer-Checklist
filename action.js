if ($("#mailer-checklist-wrapper").size() > 0) {
	$("#mailer-checklist-wrapper").remove();
} else {
	var source = "";
	xmlhttp = new XMLHttpRequest();
	var timestamp = Date.now();
	xmlhttp.open("GET", location.href + '?' + timestamp, true);
	xmlhttp.onreadystatechange=function() {
		switch (xmlhttp.readyState) {
			case 0: 
				chrome.extension.sendRequest("!request not initialized!");
				break;

			case 1: 
				chrome.extension.sendRequest("server connection established");
				break;

			case 2: 
				chrome.extension.sendRequest("request received");
				break;

			case 3:
				chrome.extension.sendRequest("processing request");
				chrome.extension.sendRequest({
					origin: "message",
					msg: "Processing..."
				});
				break;

			case 4: 
				chrome.extension.sendRequest("finished");
				source = xmlhttp.responseText;
				// quick remove HTML comments, replace empty width attributes to force error and split lines to array
				var v = source.replace(/<!.*?>/g, "").replace(/width=""/g, 'width="0"').split("\n");

				var data = {
					origin: "action"
				}
				data.syntax = testSyntax("SYNTAX problems...", v);
				data.tdwidth = testPattern("TDs without WIDTH attribute...", v, /(<td)/g, /width/g);
				data.tdDontAddUp = testTdWidth("TDs widths don't add up", v);
				
				data.imgAlt = testPattern("IMGs without ALT attributes...", v, /<img/g, /alt/g);
				data.imgBorder = testPattern("IMGs without BORDER attributes...", v, /<img/g, /border/g);
				data.imgAttr = testImages("IMGs width/height attributes...", v);
				data.imgTooWide = testImageWidth("IMGs too wide", v);

				data.spans = testPattern("You shouldn't use ROWSPANS/COLSPANS...", v, /(rowspan|colspan)/g, null);
				data.tablewidth = testPattern("TABLEs without WIDTH attribute...", v, /(<table)/g, /width/g);
				data.cellpadding = testPattern("TABLEs without CELLPADDING attribute", v, /<table/g, /cellpadding/g);
				data.cellspacing = testPattern("TABLEs without CELLSPACING attribute", v, /<table/g, /cellspacing/g);
				data.tableborder = testPattern("TABLEs without BORDER attribute", v, /<table/g, /border/g);
				data.tableTooWide = testTableWidth("TABLEs too wide", v);

				data.percent = testPattern("You should avoid % values...", v, /width=".*?%"/g, null);
				data.percentOutlook = testPattern("Outlook is funny about PX in attributes...", v, /(height|width)="[0-9]*px?"/g, null);

				//chrome.extension.sendRequest(data);
				buildPopup(data);
		}
	}

	xmlhttp.send(null)
}

// test if total width of TDs is larger that parent TABLE
function testTdWidth(desc, v) {
	var result = [desc];
	var t_width = [];
	for (var line_number = 0; line_number < v.length; line_number++) {
		var line_elements = v[line_number].replace(/</g, "\n<").split("\n");
		for (var j = 0; j < line_elements.length; j++) {
			var a = line_elements[j];
			if (a.length > 0) {
				if (a.match(/<table/) != null) {
					t_width.push(["table", getWidth(a, false), line_number + 1, a]);
				}	
				if (a.match(/<tr/) != null) {
					t_width.push(["tr", line_number + 1]);
				}
				if (a.match(/<td/) != null) {
					t_width.push(["td", getWidth(a, false), line_number + 1]);
				}

				if (a.match(/<\/table/) != null) {
					// pop all elements until TABLE
					var total_td_width = 0;
					var max_width = 0;
					var min_width = 9999;
					var tr_under = 0;
					var tr_over = 0;
					while ((el = t_width.pop())[0] != "table") {
						if (el[0] == "tr") {
							if (total_td_width > max_width) {
								max_width = Math.max(total_td_width, max_width);
								tr_over = el[1];
							}
							if (total_td_width < min_width) {
								min_width = Math.min(total_td_width, min_width);
								tr_under = el[1];
							}
							total_td_width = 0;
						} else {
							total_td_width += el[1];
						}
					}
					// el[1] contains the width of the table
					// if it's the first table and has % value exit
					if ((t_width.length == 0) && (el[1].toString().match(/%/g) != null)) {
						break;
					} else {
						if (el[1] < max_width) {
							result.push([el[2], el[3] + " - total width of all TDs is: #start#" + max_width + "px #end# - (try line: #start#[" + tr_over + "]#end#)"]);
						}
						if (min_width > 0 && el[1] > min_width) {
							result.push([el[2], el[3] + " - total width of all TDs is: #start#" + min_width + "px #end# - (try line: #start#[" + tr_under + "]#end#)"]);
						}
					}
				}	
			}
		}
	}
	return result;
}


// test if TABLE is not wider than parent TD
function testTableWidth(desc, v) {
	var result = [desc];
	var table_width = [-987];
	var td_width = [-987];

	for (var line_number = 0; line_number < v.length; line_number++) {
		var line_elements = v[line_number].replace(/</g, "\n<").split("\n");
		for (var j = 0; j < line_elements.length; j++) {
			var a = line_elements[j];
			if (a.length > 0) {
				if (a.match(/<table/) != null) {
					// test if not bigger than latest TD
					table_width.push(getWidth(a));
					if ((td_width.last() != -987) && (table_width.last() > td_width.last())) {
						result.push([line_number+1, a + " - parent TD is only #start#" + td_width.last() + "px #end# wide"]);
					}
				}	
				if (a.match(/<td/) != null) {
					td_width.push(getWidth(a, true));
				}

			}

		}
	}
	return result;
}


// test if IMG is not wider than parent TD
function testImageWidth(desc, v) {
	var result = [desc];
	var img_width = [-987];
	var td_width = [-987];

	for (var line_number = 0; line_number < v.length; line_number++) {
		var line_elements = v[line_number].replace(/</g, "\n<").split("\n");
		for (var j = 0; j < line_elements.length; j++) {
			var a = line_elements[j];
			if (a.length > 0) {
				if (a.match(/<img/) != null) {
					// test if not bigger than latest TD
					img_width.push(getWidth(a));
					if ((td_width.last() != -987) && (img_width.last() > td_width.last())) {
						result.push([line_number+1, a + " - parent TD is only #start#" + td_width.last() + "px #end# wide"]);
					}
				}	
				if (a.match(/<td/) != null) {
					td_width.push(getWidth(a, true));
				}

			}

		}
	}
	return result;
}


// extract width of element: width attribute + padding
function getWidth(a, ignorePadding) {
	var width_string = a.match(/width=".*?"/);
	var padding_value = 0;

	if (!ignorePadding) {

		var padding_string = a.match(/style.*?".*padding.*?"/);

		// found padding attribute
		if (padding_string != null) {
			$("body").append("<div id='test-padding-dummy'></div>");
			var padding_string = padding_string[0].replace(/style|=|"/g, "");
			var split_styles = padding_string.split(";");
			for (st = 0; st < split_styles.length; st++) {
				if (trim(split_styles[st]).length > 0) {
					var key_val = split_styles[st].split(":");
					$("#test-padding-dummy").css(trim(key_val[0]), trim(key_val[1]));
				}
			}

			padding_value = px2int($("#test-padding-dummy").css("padding-left")) + px2int($("#test-padding-dummy").css("padding-right"));
			$("#test-padding-dummy").remove();

		}
	}

	// found width attribute
	if (width_string != null) {
		var width_value = width_string[0].replace("width=", "").replace(/"/g, "");
		if (!isNaN(width_value)) {
			return parseInt(padding_value) + parseInt(width_value);
		} else {
			return width_value;
		}
	} 
	
	// haven't found width attribute
	return -1;
	
}

function testSyntax(desc, v) {
	var result = [desc];
	var tags = [];
	
	for (var line_number = 0; line_number < v.length; line_number++) {
		var line_elements = v[line_number].replace(/</g, "\n<").split("\n");
		for (var j = 0; j < line_elements.length; j++) {

			// end tag
			if ((m = line_elements[j].match(/<\/.*?>/)) != null) {
				var tag_name = trim(m[0].replace(/<\/|>/g, "").split(" ")[0]);
				if (tags.length > 0) {
					if ((t = tags.pop()) != tag_name) {
						result.push([line_number+1, line_elements[j] + " - expected #start# </" + t + "> #end#"]);
						return result;
					}
				}

			// start tag
			} else if ((m = line_elements[j].match(/<.*?>/)) != null) {
				// if not closed on the same line, e.g. <br />
				if (line_elements[j].match(/\/>/) == null) {
					var tag_name = trim(m[0].replace(/<|>/g, "").split(" ")[0]);
					tags.push(tag_name);
				}
			}

		}
	}
	return result;
}


function testPattern(desc, v, pattern, not_pattern) {
	var result = [desc];
	var pastFirstTable = false;

	for (var line_number = 0; line_number < v.length; line_number++) {
		var line_elements = v[line_number].replace(/</g, "\n<").split("\n");
		for (var j = 0; j < line_elements.length; j++) {

			// ignore % value on the first table
			if ((!pastFirstTable) && (line_elements[j].match(/<table/) != null) && (pattern.toString().match(/%/) != null)) {
				pastFirstTable = true;
				break;
			}

			if ((m = line_elements[j].match(pattern)) != null) {
				if (not_pattern == null) {
					result.push([line_number+1, line_elements[j].replace(pattern, "#start#$&#end#")]);
				} else {
					if (line_elements[j].match(not_pattern) == null) {
						result.push([line_number+1, line_elements[j]]);
					}
				}
			}
		}
	}
	return result;
}

function testImages(desc, v) {
	var result = [desc];
	var tags = [];
	
	for (var line_number = 0; line_number < v.length; line_number++) {
		var line_elements = v[line_number].replace(/</g, "\n<").split("\n");
		for (var j = 0; j < line_elements.length; j++) {
			if (line_elements[j].match(/<img/) != null) {
				// get source
				if ((img_src = getAttr(line_elements[j], "src")) != null) {
					var temp_img = new Image();
					temp_img.src = img_src;
					img_width = getAttr(line_elements[j], "width");
					img_height = getAttr(line_elements[j], "height");

					if ((img_width != temp_img.width) || (img_height != temp_img.height)) {
						result.push([line_number, line_elements[j] + " - should be: #start#" + temp_img.width + " x " + temp_img.height + "#end#"]);
					}
				}
			}

		}
	}
	return result;
}

// UTILS

Array.prototype.last = function() {
	return this.slice(-1)[0];
}

function trim(stringToTrim) {
	return stringToTrim.replace(/^\s+|\s+$/g,"");
}

function px2int(str) {
	return parseInt(str.replace("px", ""));
}

function getAttr(str, attr) {
	if ((attr_string = str.match(new RegExp(attr + '=".*?"'))) != null) {
		var attr_value = attr_string[0].replace(new RegExp(attr + '='), "").replace(/"/g, "");
		return attr_value;
	} else {
		return null;
	}
}
