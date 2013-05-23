$(function() {

	var topologyTreeBuilder = null;

	uptimeGadget.registerOnLoadHandler(function(onLoadData) {
		var width = onLoadData.dimensions.width;
		var height = onLoadData.dimensions.height;
		topologyTreeBuilder = new TopologyTreeBuilder({
			height : height,
			width : width
		});
	});

	uptimeGadget.registerOnResizeHandler(function(dimensions) {
		topologyTreeBuilder.resize(dimensions);
	});

	var sourceBuilder = new TopologyTreeSourceCreator();
	sourceBuilder.getSource(buildTree, displayError);

	$('input[type="checkbox"][name="showEntireTree"]').change(function() {
		sourceBuilder.rebuildTreeWithCachedResults();
	});

	function buildTree(source) {
		topologyTreeBuilder.buildTree(source);
	}

	function displayError() {
		topologyTreeBuilder.displayError();
	}

});
