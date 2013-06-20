$(function() {

	var errorFormatter = new UPTIME.pub.errors.ErrorFormatter();
	var divsToDim = [ '#treeContainer', '#treeControls' ];

	var rebuildInterval = 15 * 60 * 1000;
	var refreshInterval = 30 * 1000;

	var topologyTreeBuilder = new TopologyTreeBuilder({
		refreshInterval : refreshInterval,
		errorHandler : displayError,
		okHandler : clearNotificationPanel
	});
	var sourceBuilder = new TopologyTreeSourceCreator({
		treeRenderer : renderTree,
		errorHandler : displayError
	});

	uptimeGadget.registerOnLoadHandler(function(onLoadData) {
		topologyTreeBuilder.resize(onLoadData.dimensions);
		rebuildTree();
	});

	uptimeGadget.registerOnResizeHandler(function(dimensions) {
		topologyTreeBuilder.resize(dimensions);
	});

	function rebuildTree() {
		sourceBuilder.getSource();
		setTimeout(rebuildTree, rebuildInterval);
	}

	function renderTree(root) {
		clearNotificationPanel();
		$("#progressBar").hide();
		$("#treeControls").show();
		$("#treeContainer").show();
		$("#tooltip").show();
		topologyTreeBuilder.buildTree(root);
	}

	function clearNotificationPanel() {
		$('#notificationPanel').slideUp().empty();
		gadgetDimOff();
	}

	function displayError(error) {
		$("#progressBar").hide();
		$("#tooltip").hide();
		gadgetDimOn();
		var notificationPanel = $("#notificationPanel").empty();
		errorFormatter.getErrorBox(error, "Error retrieving data for Topology Tree.").appendTo(notificationPanel);
		notificationPanel.slideDown();
	}

	function gadgetDimOn() {
		$.each(divsToDim, function(i, d) {
			var div = $(d);
			if (div.is(':visible') && div.css('opacity') > 0.6) {
				div.fadeTo('slow', 0.3);
			}
		});
	}

	function gadgetDimOff() {
		$.each(divsToDim, function(i, d) {
			var div = $(d);
			if (div.is(':visible') && div.css('opacity') < 0.6) {
				div.fadeTo('slow', 1);
			}
		});
	}

	$("#reset").click(topologyTreeBuilder.reset);
	$("#expandAll").click(topologyTreeBuilder.expandAll);

});
