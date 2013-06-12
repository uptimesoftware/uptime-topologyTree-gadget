$(function() {

	var errorFormatter = new UPTIME.pub.errors.ErrorFormatter();

	var rebuildInterval = 15 * 60 * 1000;
	var refreshInterval = 30 * 1000;

	var topologyTreeBuilder = new TopologyTreeBuilder({
		refreshInterval : refreshInterval,
		errorHandler : displayError
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
		$("#progressBar").hide();
		$("#treeControls").show();
		$("#treeContainer").show();
		$("#tooltip").show();
		topologyTreeBuilder.buildTree(root);
	}

	function displayError(error) {
		$("#progressBar").hide();
		$("#treeControls").hide();
		$("#treeContainer").hide();
		$("#tooltip").hide();
		errorFormatter.getErrorBox(error, "Error retrieving data for Topology Tree.").appendTo($("body"));
	}

	$("#reset").click(topologyTreeBuilder.reset);
	$("#expandAll").click(topologyTreeBuilder.expandAll);

});
