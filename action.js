console.log("action.js");

var source = "";
xmlhttp = new XMLHttpRequest();
xmlhttp.open("GET", location.href, true);
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
			var v = source.split("\n");

			var data = {
				origin: "action"
			}
			data.syntax = testSyntax("SYNTAX problems...", v);
			data.tdwidth = testPattern("TDs without WIDTH attribute...", v, /(<td)/g, /width/g);
			data.tdDontAddUp = testTdWidth("TDs widths don't add up", v);
			
			data.imgAlt = testPattern("IMGs without ALT attributes...", v, /<img/g, /alt/g);
			data.imgBorder = testPattern("IMGs without BORDER attributes...", v, /<img/g, /border/g);

			data.spans = testPattern("You shouldn't use ROWSPANS/COLSPANS...", v, /(rowspan|colspan)/g, null);
			data.tablewidth = testPattern("TABLEs without WIDTH attribute...", v, /(<table)/g, /width/g);
			data.cellpadding = testPattern("TABLEs without CELLPADDING attribute", v, /<table/g, /cellpadding/g);
			data.cellspacing = testPattern("TABLEs without CELLSPACING attribute", v, /<table/g, /cellspacing/g);
			data.tableborder = testPattern("TABLEs without BORDER attribute", v, /<table/g, /border/g);
			data.tableTooWide = testTableWidth("TABLEs too wide", v);

			data.percent = testPattern("You should avoid % values...", v, /width=".*?%"/g, null);

			//chrome.extension.sendRequest(data);
			buildPopup(data);
	}
}

xmlhttp.send(null)

function testTdWidth(desc, v) {
	var result = [desc];
	var t_width = [];
	for (var line_number = 0; line_number < v.length; line_number++) {
		var line_elements = v[line_number].replace(/</g, "\n<").split("\n");
		for (var j = 0; j < line_elements.length; j++) {
			var a = line_elements[j];
			if (a.length > 0) {
				if (a.match(/<table/) != null) {
					t_width.push(["table", getWidth(a), line_number + 1, a]);
				}	
				if (a.match(/<tr/) != null) {
					t_width.push(["tr", line_number + 1]);
				}
				if (a.match(/<td/) != null) {
					t_width.push(["td", getWidth(a), line_number + 1]);
				}

				if (a.match(/<\/table/) != null) {
					// pop all elements until TABLE
					var total_td_width = 0;
					var max_width = 0;
					while ((el = t_width.pop())[0] != "table") {
						if (el[0] == "tr") {
							max_width = Math.max(total_td_width, max_width);
							total_td_width = 0;
						} else {
							total_td_width += el[1];
						}
					}
					if (el[1] < max_width) {
						result.push([el[2], el[3] + " - sum of all TDs is: #start#" + max_width + "px #end#"]);
					}
				}	
			}
		}
	}
	return result;
}



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
					if ((td_width.last() > -987) && (table_width.last() > td_width.last())) {
						result.push([line_number+1, a + " - parent TD is only #start#" + td_width.last() + "px #end# wide"]);
					}
				}	
				if (a.match(/<td/) != null) {
					td_width.push(getWidth(a));
				}

			}

		}
	}
	return result;
}


function getWidth(a) {
	var width_string = a.match(/width=".*?"/);
	var padding_string = a.match(/"padding:.*?"/);
	var padding_value = 0;

	// found padding attribute
	if (padding_string != null) {
		var padding_values = padding_string[0].replace("padding:", "").replace(/"/g, "").replace(/px/g, "");
		var split_padding_values = trim(padding_values).split(" ");
		switch (split_padding_values.length) {
			case 1:
				padding_value = parseInt(split_padding_values[0]) * 2;
				break;
			case 2:
				padding_value = parseInt(split_padding_values[1]) * 2;
				break;
			case 3:
				padding_value = parseInt(split_padding_values[1]) * 2;
				break;
			case 4:
				padding_value = parseInt(split_padding_values[1]) + parseInt(split_padding_values[3]);
				break;
			default:
				padding_value = 0;
		}
	}

	// found width attribute
	if (width_string != null) {
		var width_value = parseInt(width_string[0].replace("width=", "").replace(/"/g, ""));
		return parseInt(padding_value + width_value);
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

	for (var line_number = 0; line_number < v.length; line_number++) {
		var line_elements = v[line_number].replace(/</g, "\n<").split("\n");
		for (var j = 0; j < line_elements.length; j++) {
			if ((m = line_elements[j].match(pattern)) != null) {
				if (not_pattern == null) {
					result.push([line_number+1, line_elements[j].replace(pattern, "#start#" + m + "#end#")]);
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


// UTILS

Array.prototype.last = function() {
	return this.slice(-1)[0];
}

function trim(stringToTrim) {
	return stringToTrim.replace(/^\s+|\s+$/g,"");
}
