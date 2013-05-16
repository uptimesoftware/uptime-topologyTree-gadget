UserSettings = function() {
	this.syncSettingsToBackend=	function (rootNodes, showFullTree){
		var settings = {rootNodes:rootNodes, showFullTree:showFullTree};
 		uptimeGadget.saveSettings(settings, onGoodSave, onBadAjax);
 	};
 	
 	this.loadSettingsFromBackend = function(){
 		uptimeGadget.loadSettings(displaySettings, onBadAjax);
 	};
 	
 	var onGoodSave = function(){
 		uptimeGadget.loadSettings(displaySettings, onBadAjax);
 	};
 	
 	var displaySettings = function(setting){
 		console.log(setting);
 	};
 	
 	var onBadAjax = function(){
 		
 	};
};