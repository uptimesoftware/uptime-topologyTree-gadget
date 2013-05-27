TopologyTreeBuilder = function() {
	var treeMargins = [ 90, 20, 200, 70 ];
	var visDimensions = new UPTIME.pub.gadgets.Dimensions(100, 100);
	var treeDimensions = toTreeDimensions(visDimensions);

	var root = null;

	var topologyTreeInstance = this;

	var currNodeId = 0;
	var tree = d3.layout.tree().size([ treeDimensions.height, treeDimensions.width ]).children(function(d) {
		return d.dependents;
	}).sort(function(a, b) {
		return naturalSort(a.entityName, b.entityName);
	});

	var diagonal = d3.svg.diagonal().projection(function(d) {
		return [ d.y, d.x ];
	});
	var vis = d3.select("#topoTree").append("svg:svg").attr("width", visDimensions.width).attr("height", visDimensions.height)
			.append("svg:g").attr("transform", "translate(" + treeMargins[0] + "," + treeMargins[1] + ")");

	this.resize = function(dimensions) {

		visDimensions = dimensions;
		treeDimensions = toTreeDimensions(visDimensions);

		d3.select("svg").attr("width", visDimensions.width).attr("height", visDimensions.height);

		tree.size([ treeDimensions.height, treeDimensions.width ]);

		if (root != null) {
			topologyTreeInstance.updateTree(root);
		}

	};

	this.buildTree = function(source) {

		root = source;
		root.x0 = treeDimensions.height / 2;
		root.y0 = 10;
		$("#inProgressBar").hide();
		$("#showEntireTreeContainer").show();
		$("#selectTopLevelParentContainer").show();
		$("#tooltip").show();
		if (!uptimeGadget.isOwner()) {
			disableTreeControls();
		}
		topologyTreeInstance.updateTree(root);

		vis.append("svg:text").style("opacity", 1e-6);
	};

	this.updateTree = function(source) {

		var textPositionOffset = 20;
		var duration = d3.event && d3.event.altKey ? 5000 : 500;

		// Compute the new tree layout.
		var nodes = tree.nodes(root).reverse();

		detectCollisions(nodes);

		var node = vis.selectAll("g.node").data(nodes, function(d) {
			return d.id || (d.id = ++currNodeId);
		});

		renderLinks(nodes, source, duration);

		createNewNodes(node, source, textPositionOffset);

		updateExistingNodes(node, duration, textPositionOffset);

		removeExitingNodes(node, duration, source);

		// Stash the old positions for transition.
		nodes.forEach(function(d) {
			d.x0 = d.x;
			d.y0 = d.y;
		});

	};

	this.displayError = function() {
		$("#topoTree").hide();
		$("#tooltip").hide();
		$("#error").text("Error loading topology tree.").show();
	};

	function toTreeDimensions(dimensions) {
		var w = dimensions.width - treeMargins[0] - treeMargins[2];
		var h = dimensions.height - treeMargins[1] - treeMargins[3];
		return new UPTIME.pub.gadgets.Dimensions(w, h);
	}

	function disableTreeControls() {
		$("#showEntireTreeCheckbox").prop('disabled', true);
		$("#selectTopLevelParent").prop('disabled', true);
		$.each($("#selectTopLevelParent > option"), function(i, option) {
			$(option).prop('disabled', true);
		});
		$("#selectTopLevelParent").trigger("liszt:updated");
	}

	function getFillColour(d) {
		var entityStatus = d.entityStatus;
		if (d.entityId == 0) {
			return "black";
		}
		if (entityStatus == "OK") {
			return "#67B10B";
		}
		if (entityStatus == "MAINT") {
			return "#555B98";
		}
		if (entityStatus == "CRIT") {
			return "#B61211";
		}
		if (entityStatus == "WARN") {
			return "#DAD60B";
		}
		if (entityStatus == "UNKNOWN") {
			return "#E6E6E6";
		}
	}

	function getStrokeWidthBasedOnChildren(node) {
		if (node._children) {
			return 6.5 + node._children.length * 0.1;
		}
		return 4.5;
	}

	function nodeClickHandler(node) {
		toggle(node);
		topologyTreeInstance.updateTree(node);
	}

	function goToElement(node) {
		var url = uptimeGadget.getElementUrls(node.entityId, node.entityName);
		if (node.type != "Invisible") {
			window.top.location.href = url.services;
		}
	}

	function showStatusDetail(d) {
		var text = d3.select(this).select("text");
		text.style("fill-opacity", getTextOpacity(d));

		showStatusMessage(d);

		highlightPath(d);
	}

	function showStatusMessage(d) {
		var div = d3.select("#tooltip");

		div.transition().duration(200).style("opacity", 1).style("border-color", getFillColour(d));

		div.html(constructMessage(d)).style("left", (d3.event.pageX + 10) + "px").style("top", (d3.event.pageY - 28) + "px");
	}

	function constructMessage(d) {
		var message = "<ul class='tooltipDetail'>";
		message += "<li><div class='tooltipDetailTitle'>Element Name:</div><div>" + d.entityName + "</div></li>";
		message += "<li><div class='tooltipDetailTitle'>Element Status:</div><div>" + d.entityStatus + "</div></li>";
		message += "<li><div class='tooltipDetailTitle'>Status Message:</div><div>" + d.statusMessage + "</div></li>";
		message += "<li><div class='tooltipDetailTitle'>Element Type:</div><div>" + d.type + "</div></li>";
		if (d.monitorStatus != 0) {
			message += "<hr style='clear:both'/>";
			$.each(d.monitorStatus, function(j, monitorStatus) {
				message += "<li><div class='tooltipDetailTitle'>" + monitorStatus.name + ":</div><div>" + monitorStatus.status
						+ "</div></li>";
			});
		}
		message += "</ul>";
		return message;
	}

	function hideStatusDetail(d) {

		var text = d3.select(this).select("text");
		text.style("fill-opacity", getTextOpacity(d));
		var div = d3.select("#tooltip");
		div.transition().duration(200).style("opacity", 1e-6);
		vis.selectAll(".link").style("stroke", "lightgrey");
	}

	function highlightPath(d) {
		var eligibleTargets = getEligibleTargetIds(d);
		vis.selectAll(".link").style("stroke", function(p) {

			var linkId = p.target.id;
			if (eligibleTargets.indexOf(linkId) != -1) {
				return getFillColour(d);
			}
		});
	}

	function getEligibleTargetIds(d) {
		var eligibleIds = [];
		eligibleIds.push(d.id);
		if (d.parent) {
			eligibleIds = eligibleIds.concat(getEligibleTargetIds(d.parent));
		}
		return eligibleIds;
	}

	function getTextOpacity(d) {
		if (d.type == "Invisible" && d.isCollide == false) {
			return 0.5;
		}
		if (d.children || d.isCollide == false) {
			return 1;
		}
		return 1e-6;
	}

	function removeExitingNodes(node, duration, source) {
		// Transition exiting nodes to the parent's new position.
		var nodeExit = node.exit().transition().duration(duration).attr("transform", function(d) {
			return "translate(" + source.y + "," + source.x + ")";
		}).remove();

		nodeExit.select("circle").attr("r", 1e-6);

		nodeExit.select("text").style("fill-opacity", 1e-6);

	}

	function updateExistingNodes(node, duration, textPositionOffset) {
		// Transition nodes to their new position.
		var nodeUpdate = node.transition().duration(duration).attr("transform", function(d) {
			return "translate(" + d.y + "," + d.x + ")";
		});

		nodeUpdate.select("circle").attr("r", getStrokeWidthBasedOnChildren).style("fill", getFillColour).style("stroke",
				"midnightblue");

		nodeUpdate.select("text").attr("text-anchor", function(d) {
			return d.children ? "end" : "start";
		}).attr("x", function(d) {
			return d.children ? -textPositionOffset : textPositionOffset;
		}).style("fill-opacity", getTextOpacity);
	}

	function createNewNodes(node, source, textPositionOffset) {

		// Enter any new nodes at the parent's previous position.

		var nodeEnter = node.enter().append("svg:g").attr("class", "node").attr("transform", function(d) {
			return "translate(" + source.y0 + "," + source.x0 + ")";
		}).on("mouseover", showStatusDetail).on("mouseout", hideStatusDetail);

		nodeEnter.append("svg:circle").attr("r", 1e-6).style("fill", getFillColour).on("click", nodeClickHandler);

		nodeEnter.append("svg:text").attr("dy", ".35em").text(function(d) {
			return d.entityName;
		}).style("fill-opacity", 1e-6).on("click", goToElement);
	}

	function renderLinks(nodes, source, duration) {
		// Update the links…
		var link = vis.selectAll("path.link").data(tree.links(nodes), function(d) {
			return d.target.id;
		});

		// Enter any new links at the parent's previous position.
		link.enter().insert("svg:path", "g").attr("class", "link").attr("d", function(d) {
			var o = {
				x : source.x0,
				y : source.y0
			};
			return diagonal({
				source : o,
				target : o
			});
		});

		// Transition links to their new position.
		link.transition().duration(duration).attr("d", diagonal);

		// Transition exiting nodes to the parent's new position.
		link.exit().transition().duration(duration).attr("d", function(d) {
			var o = {
				x : source.x,
				y : source.y
			};
			return diagonal({
				source : o,
				target : o
			});
		}).remove();
	}

	// Toggle children.
	function toggle(d) {
		if (d.children) {
			d._children = d.dependents;
			d.children = null;
			d.dependents = null;
		} else {
			d.dependents = d._children;
			d.children = d._children;
			d._children = null;
		}
	}

	function isCollide(node, node_sibling) {
		var r = getStrokeWidthBasedOnChildren(node);
		n1x1 = node.x - r, n1x2 = node.x + r;
		n1y1 = node.y - r, n1y2 = node.y + r;
		var r2 = getStrokeWidthBasedOnChildren(node_sibling);
		n2x1 = node_sibling.x - r2, n2x2 = node_sibling.x + r2;
		n2y1 = node_sibling.y - r2, n2y2 = node_sibling.y + r2;
		result = ((n1x1 < n2x2 && n1x1 > n2x1) || (n1x2 > n2x2 && n1x2 < n2x1))
				&& ((n1y1 <= n2y2 && n1y1 >= n2y1) || (n1y2 >= n2y2 && n1y2 <= n2y1));

		return result;
	}

	function detectCollisions(nodes) {
		nodes.forEach(function(d, index) {
			d.isCollide = false;
			if (d.parent) {

				var siblings = d.parent.children;
				for ( var i = 0; i < siblings.length; i++) {
					if (d.entityId != siblings[i].entityId) {
						if (isCollide(d, siblings[i])) {
							d.isCollide = true;
						}
					}
				}

			}
		});
	}

};