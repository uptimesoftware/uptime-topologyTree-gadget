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
		resizeTree(onLoadData.dimensions);
		if (onLoadData.hasPreloadedSettings) {
			processSettings(onLoadData.settings);
		} else {
			uptimeGadget.loadSettings().then(processSettings, displayError);
		}
	});

	function processSettings(settings) {
		if (settings) {
			sourceBuilder.setTopLevelParentIds(settings.topLevelParentIds);
		}
		rebuildTree();
	}

	uptimeGadget.registerOnResizeHandler(resizeTree);
	
	function resizeTree(dimensions) {
		var controlsHeight = $("#treeControls").height();
		$("#treeContainer").height(dimensions.height - controlsHeight).width(dimensions.width);
		// TODO: figure out where these magic 20+2 pixels are coming from
		var treeDimensions = new UPTIME.pub.gadgets.Dimensions(dimensions.width - 20, dimensions.height - controlsHeight - 2);
		topologyTreeBuilder.resize(treeDimensions);
	}

	function rebuildTree() {
		sourceBuilder.getSource();
		setTimeout(rebuildTree, rebuildInterval);
	}

	function renderTree(root) {
		clearNotificationPanel();
		$("#progressBar").hide();
		$("#treeControls").show();
		topologyTreeBuilder.buildTree(root);
	}

	function clearNotificationPanel() {
		$('#notificationPanel').slideUp().empty();
		gadgetDimOff();
	}

	function displayError(error) {
		$("#progressBar").hide();
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
	$("#zoomIn").click(topologyTreeBuilder.zoomIn);
	$("#zoomReset").click(topologyTreeBuilder.zoomReset);
	$("#zoomOut").click(topologyTreeBuilder.zoomOut);

});
