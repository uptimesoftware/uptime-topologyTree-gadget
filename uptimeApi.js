/**
 * uptimeApi
 *
 * up.time Monitoring Station API access file for JavaScript
 *
 * @package    uptimeApi
 * @author     Joel Pereira <joel.pereira@uptimesoftware.com>
 * @copyright  2013 uptime software inc
 * @license    BSD License
 * @version    Release: 1.0
 * @link       http://support.uptimesoftware.com
 */
// Class uptimeApi
function uptimeApi () {	// constructor
	//////////////////////////////////////////////////////////
	// Private Variables (var)
	var apiVersion  = "v1";
	var subgroupIds = [];


	////////////////////////////////////////////////////////////////////
	// Public Functions (this.)
	this.getApiInfo = function(callback,error_callback) {
		this.getJSON('',callback);	// just call the api to get the version info
	}
	// we have to apply the filter, so let's have an anonymous callback function here for the filter
	this.getElements = function(filter,callback,error_callback) {
		this.getJSON('/'+apiVersion+'/elements/',function(data){
			// run through the filter engine
			output = runFilter(data, filter);
			callback(output);
		},error_callback);
	}
	this.getMonitors = function(filter,callback,error_callback) {
		this.getJSON('/'+apiVersion+'/monitors/',function(data){
			// run through the filter engine
			output = runFilter(data, filter);
			callback(output);
		});
	}
	this.getGroups = function(filter,callback,error_callback) {
		this.getJSON('/'+apiVersion+'/groups/',function(data){
			// run through the filter engine
			output = runFilter(data, filter);
			callback(output);
		},error_callback);
	}
	// no filter, so let's just return via the callback
	this.getElementStatus = function(id,callback,error_callback) {
		this.getJSON('/'+apiVersion+'/elements/'+id+'/status',callback,error_callback);
	}
	this.getMonitorStatus = function(id,callback,error_callback) {
		this.getJSON('/'+apiVersion+'/monitors/'+id+'/status',callback,error_callback);
	}
	this.getGroupStatus = function(id,callback,error_callback) {
		this.getJSON('/'+apiVersion+'/groups/'+id+'/status',callback,error_callback);
		
	}
	
	
	var that = this;
	
	this.emptySubgroupIds = function() {
		subgroupIds = [];
	}
	
	this.getSubGroups = function (groupId,callback) {
		var anotherObject = this;
		
		//console.log("Getting subgroups for Group ID="+groupId);
		this.getGroups("groupId="+groupId, function(groups) {
			//var blahObject = this;
			//console.log("In getGroups");
			//console.log("    In getGroups");
			//console.log(groups);
			
			// When there's no sub group
			if ($.isEmptyObject(groups)) {
				//console.log("Group is empty.  Returning....");
				//console.log(subgroupIds);
				return;
				
			} else {
				//console.log("In getGroups: else");
				//console.log("In getGroups: else: groups=");
				//console.log(groups);
				$.each(groups, function(index,group) {
					//console.log("In getGroups: else: group=");
					//console.log(group);
					//console.log("    Pushing Group ID="+group.id);
					//subgroupIds.push(group.id);
					//console.log("Need to go deeper on Group ID="+group.id);
					
					//anotherObject.callback(group.id);
					callback(group.id);
					that.getSubGroups(group.id,callback);
					
				});
				//console.log("    about to callback="+subgroupIds);
				//callback(subgroupIds);
			}
		
		
		});
		//callback(subgroupIds);
	}
	/*
	this.getSubgroups = function(id,callback,error_callback) {
		//this.getJSON('/'+apiVersion+'/groups/'+id+'/status',callback,error_callback);
		
		
		
		this.getJSON('/'+apiVersion+'/groups/',function (groups) {
			$.each(groups, function(index,group) {
				console.log("groupId="+group.groupId);
			}
			,error_callback);
		});
	
	}*/
	
	// Make the call to the up.time API via JSON
	this.getJSON = function(APICall, callback, error_callback, should_cache) {
		$.ajax( {
			url      : "/api" + APICall,
			dataType : 'json',
			cache    : should_cache,
			//username : apiUsername,
			//password : apiPassword,
			error    : function(jqXHR, textStatus, errorThrown) {
				//console.log(textStatus);	// debug
				//console.log(errorThrown);	// debug
				
				// return the data output
				//error_callback(jqXHR, textStatus, errorThrown);
				if (error_callback) {
					error_callback(jqXHR, textStatus, errorThrown);
				}
			},
			success  : function( data ) {

				//console.log(data);	// debug
				
				// return the data output
				callback(data);
			}
		});
	}



	//////////////////////////////////////////////////////////
	// Private Functions

	// Read filter string and put it into an array
	// The valid filter string format is: "var1=x&var2=y"
	var parseFilterString = function(filter) {
		var rv = {keys: new Array(), values: new Array()};
		// check if there is a filter
		if (filter && filter != "") {
			// check if there's more than one filter ("&")
			if (filter.search("&") != -1) {
				var filterArray = filter.split("&");
			}
			else {
				// single filter, so just put it in the array
				var filterArray = new Array();
				filterArray.push(filter);
			}
			// Parse through the filters
			for (i=0; i < filterArray.length; i++) {
				var tmpArray = filterArray[i].split("=",2);
				// make sure it's a valid filter (format: a=b)
				if (tmpArray.length == 2 && tmpArray[0].length > 0 && tmpArray[1].length > 0) {
					// place the key and value in their own arrays within the filter object
					rv.keys.push(tmpArray[0].trim());
					rv.values.push(tmpArray[1].trim());
				}
			}
		}
		//console.log("Filter string parsed:");
		//console.log(rv);	// debug filter string
		return rv;
	}
	// Run through all filters
	// The value will be checked as a regex with case-insensitivity
	var runFilter = function(data, filter) {
		// parse the filter string
		var filterArr = parseFilterString(filter);

		// check if we need to apply filter(s)
		if (filterArr.keys.length > 0) {
			// first, check if we're dealing with an object or an array of objects
			if (data instanceof Array) {
				/////////////////////////////////////
				// array of objects
				var output = new Array();
				
				// foreach array object (if there is any)
				var addToArray = false;
				$.each(data, function(data_id, data_obj) {
					// let's apply the filter to each object
					addToArray = true;	// assume we can add everything until we can't
					for (i=0; i < filterArr.keys.length; i++) {
						// setup the pattern string
						var pattern = new RegExp(filterArr.keys[i], 'ig');
						// check if the key exists and if the value matches (regex)
						if (data_obj.hasOwnProperty(filterArr.keys[i])) {
							// convert value to string for regex string matching
							var tmpStr = String(data_obj[filterArr.keys[i]]);
							// now let's check the regex expression
							if (tmpStr.match(filterArr.values[i])) {
								// passed this filter
							}
							else {
								// failed the filter, so let's not add it
								addToArray = false;
							}
						}
						else {
							// key doesn't exist; let's not add it
							addToArray = false;
						}
					}
					// check if we can add the current object
					if (addToArray) {
						// value matched, so let's add it to the filtered array
						output.push(data_obj);
					}
				});
				return output;
			}
			else {
				/////////////////////////////////////
				// single object
				//don't apply filter on these
				var output = data;
			}
			return output;
		}
		else {
			// no filter, so just return the array/object
			return data;
		}

	}
	
}


	
// make sure String(s) can trim
if(!String.prototype.trim) {
  String.prototype.trim = function () {
    return this.replace(/^\s+|\s+$/g,'');
  };
}