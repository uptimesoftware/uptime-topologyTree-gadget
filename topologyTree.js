$(function() {

	var rebuildInterval = 15 * 60 * 1000;

	var topologyTreeBuilder = new TopologyTreeBuilder();
	var sourceBuilder = new TopologyTreeSourceCreator({
		renderTree : topologyTreeBuilder.buildTree,
		displayError : topologyTreeBuilder.displayError
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

});
